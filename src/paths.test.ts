import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beaconDir, promptsFile } from "./paths.ts";

let dir: string;
let origWrite: typeof process.stderr.write;
let out: string[];
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "beacon-paths-"));
	out = [];
	origWrite = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((c: string) => {
		out.push(String(c));
		return true;
	}) as typeof process.stderr.write;
});
afterEach(() => {
	process.stderr.write = origWrite;
	rmSync(dir, { recursive: true, force: true });
});

describe("paths", () => {
	it("resolves under .luuna/beacon", () => {
		expect(promptsFile(dir)).toBe(join(dir, ".luuna", "beacon", "prompts.jsonl"));
	});

	it("migrates a legacy directory on first use", () => {
		mkdirSync(join(dir, ".canopy"));
		beaconDir(dir);
		expect(existsSync(join(dir, ".luuna", "beacon"))).toBe(true);
		expect(out.join("")).toContain("Migrated");
	});
});

describe("CLI migration output", () => {
	it("keeps JSON on stdout and the notice on stderr", async () => {
		mkdirSync(join(dir, ".canopy"));
		writeFileSync(join(dir, ".canopy", "prompts.jsonl"), "");
		const cli = join(import.meta.dir, "index.ts");
		const proc = Bun.spawn(["bun", cli, "list", "--json"], {
			cwd: dir,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, NO_COLOR: "1" },
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		await proc.exited;
		expect(stderr).toContain("Migrated");
		expect(stdout).not.toContain("Migrated");
		expect(() => JSON.parse(stdout)).not.toThrow();
		expect(existsSync(join(dir, ".luuna", "beacon"))).toBe(true);
	});
});
