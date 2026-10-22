import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeLegacyRecord } from "./legacy-layout.ts";
import { readJsonl } from "./store.ts";
import type { Prompt } from "./types.ts";
import { validateAtlas } from "./validate.ts";

const base = {
	id: "p-1",
	name: "builder",
	version: 1,
	sections: [{ name: "role", body: "Hi" }],
	status: "active",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

describe("normalizeLegacyRecord", () => {
	it("maps old keys to new keys and drops the old ones", () => {
		const out = normalizeLegacyRecord({
			...base,
			mulch: { prime: { domains: ["a"] } },
			extends_mulch: true,
		}) as Record<string, unknown>;
		expect(out.atlas).toEqual({ prime: { domains: ["a"] } });
		expect(out.extends_atlas).toBe(true);
		expect("mulch" in out).toBe(false);
		expect("extends_mulch" in out).toBe(false);
	});

	it("prefers the new key when both are present", () => {
		const out = normalizeLegacyRecord({
			...base,
			mulch: { budget: 1 },
			atlas: { budget: 2 },
			extends_mulch: true,
			extends_atlas: false,
		}) as Record<string, unknown>;
		expect(out.atlas).toEqual({ budget: 2 });
		expect(out.extends_atlas).toBe(false);
		expect("mulch" in out).toBe(false);
	});

	it("leaves current records untouched", () => {
		const rec = { ...base, atlas: { budget: 3 } };
		expect(normalizeLegacyRecord(rec)).toBe(rec);
	});
});

describe("old-key records end to end", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "beacon-keys-"));
		mkdirSync(join(dir, ".luuna", "beacon"), { recursive: true });
		writeFileSync(join(dir, ".luuna", "beacon", "config.yaml"), "version: 1\n");
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	async function run(args: string[]) {
		const proc = Bun.spawn(["bun", join(import.meta.dir, "index.ts"), ...args], {
			cwd: dir,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, NO_COLOR: "1" },
		});
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;
		return stdout;
	}

	it("loads an old-key record and renders it with the atlas key", async () => {
		const file = join(dir, ".luuna", "beacon", "prompts.jsonl");
		writeFileSync(
			file,
			`${JSON.stringify({ ...base, mulch: { prime: { domains: ["x"] }, budget: 5 } })}\n`,
		);
		const rows = await readJsonl<Prompt>(file);
		expect(rows[0]?.atlas?.budget).toBe(5);
		const env = JSON.parse(await run(["render", "builder", "--json"]));
		expect(env.atlas).toEqual({ prime: { domains: ["x"] }, budget: 5 });
		expect("mulch" in env).toBe(false);
	});

	it("writes only new keys when an old-key record is updated", async () => {
		const file = join(dir, ".luuna", "beacon", "prompts.jsonl");
		writeFileSync(file, `${JSON.stringify({ ...base, mulch: { budget: 5 }, extends_mulch: false })}\n`);
		await run(["update", "builder", "--section", "role:New", "--json"]);
		const last = JSON.parse(readFileSync(file, "utf8").trim().split("\n").pop() ?? "{}");
		expect(last.atlas).toEqual({ budget: 5 });
		expect("mulch" in last).toBe(false);
		expect("extends_mulch" in last).toBe(false);
	});
});

describe("validateAtlas", () => {
	it("accepts a well-formed block and flags bad new keys", () => {
		expect(validateAtlas({ ...base, atlas: { budget: 1 }, extends_atlas: true } as Prompt)).toEqual([]);
		const errs = validateAtlas({ ...base, atlas: { budget: -1 }, extends_atlas: "yes" } as unknown as Prompt);
		expect(errs.map((e) => e.message).join("\n")).toContain("atlas.budget");
		expect(errs.map((e) => e.message).join("\n")).toContain("extends_atlas must be a boolean");
	});
});
