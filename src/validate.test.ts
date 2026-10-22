import { describe, expect, it } from "bun:test";
import type { Prompt, Schema } from "./types.ts";
import { validateAtlas, validatePrompt } from "./validate.ts";

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

function makeSchema(overrides: Partial<Schema> & { id: string; name: string }): Schema {
	return {
		requiredSections: [],
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("validatePrompt", () => {
	it("passes when all required sections present", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [
				{ name: "role", body: "You are a builder." },
				{ name: "constraints", body: "Never push." },
			],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("fails when required section is missing", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "role", body: "You are a builder." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.section).toBe("constraints");
	});

	it("validates regex rules", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Be careful." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["constraints"],
			rules: [
				{
					section: "constraints",
					pattern: "Never push",
					message: "Must include push restriction",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toBe("Must include push restriction");
	});

	it("passes regex rule when pattern matches", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Never push to canonical branch." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["constraints"],
			rules: [
				{
					section: "constraints",
					pattern: "Never push",
					message: "Must include push restriction",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(true);
	});

	it("includes inherited sections in validation", () => {
		const base = makePrompt({
			id: "p-0001",
			name: "base",
			sections: [{ name: "constraints", body: "Never push." }],
		});

		const child = makePrompt({
			id: "p-0002",
			name: "child",
			extends: "base",
			sections: [{ name: "role", body: "Child role." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(child, schema, [base, child]);
		expect(result.valid).toBe(true);
	});

	it("reports warning for invalid regex", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Never push." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: [],
			rules: [
				{
					section: "constraints",
					pattern: "[invalid regex",
					message: "Bad pattern",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("surfaces atlas shape errors through validatePrompt", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [],
			atlas: { on_empty: "explode" } as unknown as Prompt["atlas"],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: [],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.section === "atlas.on_empty")).toBe(true);
	});
});

describe("validateAtlas", () => {
	function p(overrides: Partial<Prompt> & { id?: string; name?: string }): Prompt {
		return {
			id: "p-0001",
			name: "test",
			version: 1,
			sections: [],
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
			...overrides,
		};
	}

	it("returns no errors when atlas and extends_atlas are absent", () => {
		expect(validateAtlas(p({}))).toEqual([]);
	});

	it("returns no errors for a well-formed atlas block", () => {
		const prompt = p({
			extends_atlas: true,
			atlas: {
				prime: { domains: ["warren"], files: ["src/**"] },
				budget: 50000,
				on_empty: "skip",
			},
		});
		expect(validateAtlas(prompt)).toEqual([]);
	});

	it("rejects non-boolean extends_atlas", () => {
		const prompt = p({ extends_atlas: "yes" as unknown as boolean });
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("extends_atlas");
		expect(errs[0]?.message).toContain("must be a boolean");
	});

	it("rejects atlas that is not an object", () => {
		const prompt = p({ atlas: "domains" as unknown as Prompt["atlas"] });
		const errs = validateAtlas(prompt);
		expect(errs.some((e) => e.section === "atlas" && e.rule === "type")).toBe(true);
	});

	it("rejects unknown top-level keys under atlas", () => {
		const prompt = p({
			atlas: { foo: 1 } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs.some((e) => e.rule === "unknown-key" && e.message.includes('"foo"'))).toBe(true);
	});

	it("rejects bad on_empty value", () => {
		const prompt = p({
			atlas: { on_empty: "explode" } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.on_empty");
		expect(errs[0]?.message).toContain('"skip"');
	});

	it("rejects non-array domains", () => {
		const prompt = p({
			atlas: { prime: { domains: "warren" } } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.prime.domains");
	});

	it("rejects non-string entries in domains array", () => {
		const prompt = p({
			atlas: { prime: { domains: ["ok", 42] } } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs.some((e) => e.section === "atlas.prime.domains")).toBe(true);
	});

	it("rejects non-array files", () => {
		const prompt = p({
			atlas: { prime: { files: { glob: "src/**" } } } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.prime.files");
	});

	it("rejects unknown keys under atlas.prime", () => {
		const prompt = p({
			atlas: { prime: { domains: ["a"], scope: "all" } } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs.some((e) => e.section === "atlas.prime" && e.rule === "unknown-key")).toBe(true);
	});

	it("rejects prime that is not an object", () => {
		const prompt = p({
			atlas: { prime: ["a", "b"] } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.prime");
	});

	it("rejects negative budget", () => {
		const prompt = p({
			atlas: { budget: -1 } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.budget");
	});

	it("rejects non-numeric budget", () => {
		const prompt = p({
			atlas: { budget: "lots" } as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("atlas.budget");
	});

	it("collects multiple errors in one pass", () => {
		const prompt = p({
			extends_atlas: 1 as unknown as boolean,
			atlas: {
				prime: { domains: 1 },
				budget: -5,
				on_empty: "loud",
				bogus: true,
			} as unknown as Prompt["atlas"],
		});
		const errs = validateAtlas(prompt);
		expect(errs.length).toBeGreaterThanOrEqual(4);
		const sections = errs.map((e) => e.section);
		expect(sections).toContain("extends_atlas");
		expect(sections).toContain("atlas.prime.domains");
		expect(sections).toContain("atlas.budget");
		expect(sections).toContain("atlas.on_empty");
	});
});
