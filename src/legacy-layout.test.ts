import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacyLayout, upgradeLegacyMarkers } from "./legacy-layout.ts";

let dir: string;
let stderr: string[];
let origWrite: typeof process.stderr.write;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "beacon-legacy-"));
	stderr = [];
	origWrite = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: string) => {
		stderr.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
});

afterEach(() => {
	process.stderr.write = origWrite;
	rmSync(dir, { recursive: true, force: true });
});

describe("migrateLegacyLayout", () => {
	it("is a no-op without a legacy directory", () => {
		expect(migrateLegacyLayout(dir)).toBe(false);
		expect(stderr).toEqual([]);
	});

	it("moves the legacy dir, rewrites git files, and notes once on stderr", () => {
		mkdirSync(join(dir, ".canopy"));
		writeFileSync(join(dir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');
		writeFileSync(join(dir, ".gitattributes"), ".canopy/prompts.jsonl merge=union\n");
		writeFileSync(join(dir, ".gitignore"), ".canopy/*.lock\n");
		expect(migrateLegacyLayout(dir)).toBe(true);
		expect(existsSync(join(dir, ".canopy"))).toBe(false);
		expect(readFileSync(join(dir, ".luuna", "beacon", "prompts.jsonl"), "utf8")).toBe('{"id":"p1"}\n');
		expect(readFileSync(join(dir, ".gitattributes"), "utf8")).toBe(
			".luuna/beacon/prompts.jsonl merge=union\n",
		);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(".luuna/beacon/*.lock\n");
		expect(stderr.join("").trim().split("\n")).toHaveLength(1);
		expect(migrateLegacyLayout(dir)).toBe(false);
	});

	it("fails when both layouts exist", () => {
		mkdirSync(join(dir, ".canopy"));
		mkdirSync(join(dir, ".luuna", "beacon"), { recursive: true });
		expect(() => migrateLegacyLayout(dir)).toThrow(/Both/);
		expect(existsSync(join(dir, ".canopy"))).toBe(true);
	});

	it("refuses a symlinked legacy dir", () => {
		const real = join(dir, "real");
		mkdirSync(real);
		try {
			symlinkSync(real, join(dir, ".canopy"), "junction");
		} catch {
			return;
		}
		expect(() => migrateLegacyLayout(dir)).toThrow(/symlink/);
	});

	it("refuses a symlinked .luuna", () => {
		const real = join(dir, "real");
		mkdirSync(real);
		mkdirSync(join(dir, ".canopy"));
		try {
			symlinkSync(real, join(dir, ".luuna"), "junction");
		} catch {
			return;
		}
		expect(() => migrateLegacyLayout(dir)).toThrow(/symlink/);
		expect(existsSync(join(dir, ".canopy"))).toBe(true);
	});
});

describe("upgradeLegacyMarkers", () => {
	it("rewrites legacy onboard markers", () => {
		expect(upgradeLegacyMarkers("<!-- canopy:start -->x<!-- canopy:end -->")).toBe(
			"<!-- luuna-beacon:start -->x<!-- luuna-beacon:end -->",
		);
	});
});
