import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = resolve(import.meta.dir, "../index.ts");
const roots: string[] = [];

function workspace(): string {
	const root = mkdtempSync(join(tmpdir(), "lbc-artifact-"));
	roots.push(root);
	return root;
}

function cli(cwd: string, ...args: string[]): { code: number; data: Record<string, unknown>; stdout: string } {
	const result = Bun.spawnSync(["bun", entry, "--json", ...args], { cwd });
	const stdout = result.stdout.toString();
	if (!stdout.trim()) throw new Error(`CLI returned no JSON (exit ${result.exitCode}): ${result.stderr.toString()}`);
	return { code: result.exitCode, data: JSON.parse(stdout) as Record<string, unknown>, stdout };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("versioned artifacts through the public CLI", () => {
	it("captures a complete skill, survives source deletion, versions changes, and exports to Claude", () => {
		const root = workspace();
		expect(cli(root, "init").code).toBe(0);
		const source = join(root, "source-skill");
		mkdirSync(join(source, "references"), { recursive: true });
		mkdirSync(join(source, "scripts"), { recursive: true });
		writeFileSync(join(source, "SKILL.md"), "---\nname: demo\n---\nRead [guide](references/guide.md).\n");
		writeFileSync(join(source, "references", "guide.md"), "# Guide\nFirst version.\n");
		writeFileSync(join(source, "scripts", "run.sh"), "#!/bin/sh\necho ready\n", { mode: 0o755 });
		const first = cli(root, "skill", "import", source, "--name", "demo");
		expect(first.code).toBe(0);
		expect((first.data.artifact as { version: number }).version).toBe(1);
		writeFileSync(join(source, "references", "guide.md"), "# Guide\nSecond version.\n");
		const second = cli(root, "skill", "update", "demo", source);
		expect(second.code).toBe(0);
		expect((second.data.artifact as { version: number }).version).toBe(2);
		const identical = cli(root, "skill", "update", "demo", source);
		expect((identical.data.artifact as { version: number }).version).toBe(2);
		rmSync(source, { recursive: true });
		expect(cli(root, "skill", "verify").data.checked).toBe(2);
		const exported = cli(root, "skill", "export", "demo@1", "--target", "claude");
		expect(exported.code).toBe(0);
		const destination = join(root, ".claude", "skills", "demo");
		expect(readFileSync(join(destination, "references", "guide.md"), "utf8")).toContain("First version");
		expect(readFileSync(join(destination, "scripts", "run.sh"), "utf8")).toContain("echo ready");
		expect(cli(root, "skill", "export", "demo@2", "--target", "claude").code).toBe(1);
		expect(cli(root, "skill", "export", "demo@2", "--target", "claude", "--force").code).toBe(0);
		expect(readFileSync(join(destination, "references", "guide.md"), "utf8")).toContain("Second version");
		const history = cli(root, "skill", "history", "demo");
		expect((history.data.versions as unknown[]).length).toBe(2);
	});

	it("stores and reconstructs an agent and a complete Claude plugin bundle", () => {
		const root = workspace();
		expect(cli(root, "init").code).toBe(0);
		const agent = join(root, "reviewer.md");
		writeFileSync(agent, "---\nname: reviewer\n---\nReview the diff.\n");
		expect(cli(root, "agent", "import", agent, "--name", "reviewer").code).toBe(0);
		rmSync(agent);
		expect(cli(root, "agent", "export", "reviewer", "--target", "claude").code).toBe(0);
		expect(readFileSync(join(root, ".claude", "agents", "reviewer.md"), "utf8")).toContain("Review the diff");

		const bundle = join(root, "plugin-source");
		mkdirSync(join(bundle, ".claude-plugin"), { recursive: true });
		mkdirSync(join(bundle, "skills", "review", "references"), { recursive: true });
		mkdirSync(join(bundle, "hooks", "scripts"), { recursive: true });
		writeFileSync(join(bundle, ".claude-plugin", "plugin.json"), '{"name":"demo-plugin"}\n');
		writeFileSync(join(bundle, "skills", "review", "SKILL.md"), "# Review\n");
		writeFileSync(join(bundle, "skills", "review", "references", "guide.md"), "# Reference\n");
		writeFileSync(join(bundle, "hooks", "hooks.json"), "{}\n");
		writeFileSync(join(bundle, "hooks", "scripts", "run.sh"), "#!/bin/sh\nexit 0\n");
		expect(cli(root, "bundle", "import", bundle, "--name", "demo-plugin").code).toBe(0);
		rmSync(bundle, { recursive: true });
		const output = join(root, "reconstructed-plugin");
		expect(cli(root, "bundle", "export", "demo-plugin", "--out", output).code).toBe(0);
		expect(existsSync(join(output, "hooks", "scripts", "run.sh"))).toBe(true);
		expect(readFileSync(join(output, "skills", "review", "references", "guide.md"), "utf8")).toBe("# Reference\n");
	});

	it("rejects credential files, protected export paths, and divergent versions", () => {
		const root = workspace();
		expect(cli(root, "init").code).toBe(0);
		const source = join(root, "skill-source");
		mkdirSync(source);
		writeFileSync(join(source, "SKILL.md"), "# Safe\n");
		writeFileSync(join(source, ".env"), "TOKEN=private\n");
		expect(cli(root, "skill", "import", source, "--name", "safe").code).toBe(1);
		rmSync(join(source, ".env"));
		expect(cli(root, "skill", "import", source, "--name", "safe").code).toBe(0);
		expect(cli(root, "skill", "export", "safe", "--out", join(root, ".luuna", "beacon", "bad-export")).code).toBe(1);
		const jsonl = join(root, ".luuna", "beacon", "artifacts.jsonl");
		const original = JSON.parse(readFileSync(jsonl, "utf8").trim()) as { files: Array<{ path: string; content: string; sha256: string; executable: boolean }>; sha256: string };
		const divergent = structuredClone(original);
		const firstFile = divergent.files[0];
		if (!firstFile) throw new Error("Expected imported skill file");
		firstFile.content = "# Changed\n";
		firstFile.sha256 = createHash("sha256").update(firstFile.content).digest("hex");
		divergent.sha256 = createHash("sha256")
			.update(JSON.stringify(divergent.files.map(({ path, sha256, executable }) => ({ path, sha256, executable }))))
			.digest("hex");
		writeFileSync(jsonl, `${JSON.stringify(original)}\n${JSON.stringify(divergent)}\n`);
		const result = cli(root, "skill", "list");
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("Conflicting artifact version");
	});
});
