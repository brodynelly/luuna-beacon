import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import init from "./init.ts";
import renderCmd from "./render.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-render");

function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
	const origLog = console.log;
	const origError = console.error;
	let stdout = "";
	let stderr = "";
	console.log = (...args: unknown[]) => {
		stdout += `${args.join(" ")}\n`;
	};
	console.error = (...args: unknown[]) => {
		stderr += `${args.join(" ")}\n`;
	};
	return fn()
		.then(() => {
			console.log = origLog;
			console.error = origError;
			return { stdout, stderr };
		})
		.catch((err) => {
			console.log = origLog;
			console.error = origError;
			throw err;
		});
}

async function seedPrompt(prompt: Prompt): Promise<void> {
	const promptsPath = join(tmpDir, ".luuna", "beacon", "prompts.jsonl");
	await appendJsonl(promptsPath, prompt);
}

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

beforeEach(async () => {
	mkdirSync(tmpDir, { recursive: true });
	const origCwd = process.cwd();
	process.chdir(tmpDir);
	await captureOutput(() => init([], false));
	process.chdir(origCwd);
});

afterEach(() => {
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe("luuna-beacon render --json envelope", () => {
	it("surfaces resolved atlas as a top-level field when declared", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "role-with-atlas",
					sections: [{ name: "role", body: "You are an agent." }],
					atlas: {
						prime: { domains: ["beacon"], files: ["src/render.ts"] },
						budget: 5000,
						on_empty: "warn",
					},
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["role-with-atlas", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.atlas).toEqual({
				prime: { domains: ["beacon"], files: ["src/render.ts"] },
				budget: 5000,
				on_empty: "warn",
			});
		} finally {
			process.chdir(origCwd);
		}
	});

	it("omits atlas entirely (not null, not {}) when no role declared one", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "plain",
					sections: [{ name: "role", body: "Plain role." }],
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["plain", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect("atlas" in parsed).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("surfaces resolved atlas from inheritance chain (extends_atlas=true)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [{ name: "role", body: "Base." }],
					atlas: { prime: { domains: ["a"] }, budget: 1000 },
				}),
			);
			await seedPrompt(
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["b"] }, budget: 2000 },
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["child", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.atlas).toEqual({
				prime: { domains: ["a", "b"] },
				budget: 2000,
			});
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--format json (no envelope) also surfaces atlas as top-level field", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "role-with-atlas",
					sections: [{ name: "role", body: "You are an agent." }],
					atlas: { prime: { domains: ["beacon"] } },
				}),
			);

			const { stdout } = await captureOutput(() =>
				renderCmd(["role-with-atlas", "--format", "json"], false),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.atlas).toEqual({ prime: { domains: ["beacon"] } });
			expect(parsed.success).toBeUndefined();
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--format json omits atlas when undeclared", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "plain",
					sections: [{ name: "role", body: "Plain role." }],
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["plain", "--format", "json"], false));
			const parsed = JSON.parse(stdout.trim());
			expect("atlas" in parsed).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});
});
