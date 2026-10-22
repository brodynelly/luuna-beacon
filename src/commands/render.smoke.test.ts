import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";

// End-to-end smoke test for warren-style consumption of `luuna-beacon render --json`.
// Unlike render.test.ts (which calls renderCmd directly), this spawns the
// actual luuna-beacon CLI as a subprocess — the same way warren consumes beacon at
// run-spawn time — and asserts the envelope contract plus the no-shell-out
// invariant (acceptance criterion 7 of pl-003f).

const tmpDir = join(import.meta.dir, "../../.test-tmp-render-smoke");
const cliEntry = join(import.meta.dir, "../index.ts");

function makePrompt(overrides: Partial<Prompt> & { id: string; name: string }): Prompt {
	return {
		version: 1,
		sections: [],
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

async function seed(prompt: Prompt): Promise<void> {
	await appendJsonl(join(tmpDir, ".luuna", "beacon", "prompts.jsonl"), prompt);
}

interface CliResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

async function runCli(args: string[], pathPrefix?: string): Promise<CliResult> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") env[k] = v;
	}
	if (pathPrefix) {
		env.PATH = `${pathPrefix}:${env.PATH ?? ""}`;
	}
	const proc = Bun.spawn(["bun", cliEntry, ...args], {
		cwd: tmpDir,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

beforeEach(() => {
	mkdirSync(join(tmpDir, ".luuna", "beacon"), { recursive: true });
	writeFileSync(join(tmpDir, ".luuna", "beacon", "config.yaml"), "version: 1\n");
});

afterEach(() => {
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe("warren-style smoke: luuna-beacon render --json envelope", () => {
	it("returns a stable envelope with atlas field when role declares atlas", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "warren-builder",
				sections: [{ name: "role", body: "Warren builder agent." }],
				atlas: {
					prime: { domains: ["beacon", "warren"], files: ["src/**"] },
					budget: 8000,
					on_empty: "warn",
				},
			}),
		);

		const { stdout, exitCode } = await runCli(["render", "warren-builder", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.success).toBe(true);
		expect(envelope.command).toBe("render");
		expect(envelope.name).toBe("warren-builder");
		expect(envelope.version).toBe(1);
		expect(envelope.sections).toEqual([{ name: "role", body: "Warren builder agent." }]);
		expect(envelope.resolvedFrom).toEqual(["warren-builder"]);
		expect(envelope.frontmatter).toEqual({});
		expect(envelope.atlas).toEqual({
			prime: { domains: ["beacon", "warren"], files: ["src/**"] },
			budget: 8000,
			on_empty: "warn",
		});

		// Warren's downstream consumption: build an `luuna-atlas prime` invocation from
		// the resolved atlas declaration. This asserts the field shape is what
		// warren actually needs.
		const domains = envelope.atlas.prime.domains as string[];
		const files = envelope.atlas.prime.files as string[];
		const primeArgs = ["luuna-atlas", "prime", ...domains, "--files", ...files];
		expect(primeArgs).toEqual(["luuna-atlas", "prime", "beacon", "warren", "--files", "src/**"]);
	});

	it("omits atlas entirely when no role in chain declares one", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "plain-role",
				sections: [{ name: "role", body: "Plain agent." }],
			}),
		);

		const { stdout, exitCode } = await runCli(["render", "plain-role", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.success).toBe(true);
		expect("atlas" in envelope).toBe(false);
	});

	it("merges atlas across multi-level chain when extends_atlas=true at each layer", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "grand",
				sections: [{ name: "role", body: "Grand role." }],
				atlas: { prime: { domains: ["beacon"] }, budget: 1000, on_empty: "error" },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0002",
				name: "parent",
				extends: "grand",
				extends_atlas: true,
				sections: [],
				atlas: { prime: { domains: ["warren"] }, budget: 2000 },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0003",
				name: "child",
				extends: "parent",
				extends_atlas: true,
				sections: [],
				atlas: { prime: { files: ["src/**"] }, on_empty: "skip" },
			}),
		);

		const { stdout, exitCode } = await runCli(["render", "child", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.resolvedFrom).toEqual(["grand", "parent", "child"]);
		expect(envelope.atlas).toEqual({
			prime: { domains: ["beacon", "warren"], files: ["src/**"] },
			budget: 2000,
			on_empty: "skip",
		});
	});

	it("child wholesale overrides parent atlas when extends_atlas is unset", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [{ name: "role", body: "Base." }],
				atlas: { prime: { domains: ["a", "b"] }, budget: 1000 },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [],
				atlas: { prime: { domains: ["c"] } },
			}),
		);

		const { stdout, exitCode } = await runCli(["render", "child", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.atlas).toEqual({ prime: { domains: ["c"] } });
	});

	it("does not shell out to `luuna-atlas` (PATH tracer asserts no invocation)", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "warren-builder",
				sections: [{ name: "role", body: "Warren builder." }],
				atlas: { prime: { domains: ["beacon"] }, budget: 5000, on_empty: "warn" },
			}),
		);

		// Plant an `luuna-atlas` shim earlier in PATH that records every invocation
		// to a marker file. If `luuna-beacon render` were to shell out to atlas, the
		// marker would appear.
		const traceDir = join(tmpDir, ".trace");
		mkdirSync(traceDir, { recursive: true });
		const marker = join(traceDir, "atlas-was-called");
		const tracer = join(traceDir, "luuna-atlas");
		writeFileSync(tracer, `#!/bin/sh\necho "$@" >> ${JSON.stringify(marker)}\nexit 0\n`);
		Bun.spawnSync(["chmod", "+x", tracer]);

		const { stdout, exitCode } = await runCli(["render", "warren-builder", "--json"], traceDir);
		expect(exitCode).toBe(0);
		expect(existsSync(marker)).toBe(false);

		// The render still succeeds and surfaces the resolved atlas unchanged.
		const envelope = JSON.parse(stdout.trim());
		expect(envelope.atlas).toEqual({
			prime: { domains: ["beacon"] },
			budget: 5000,
			on_empty: "warn",
		});
	});
});
