import { describe, expect, it } from "bun:test";
import { resolvePrompt } from "./render.ts";
import type { Prompt } from "./types.ts";

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

describe("resolvePrompt", () => {
	it("returns own sections when no parent", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "You are an agent." },
					{ name: "constraints", body: "No push." },
				],
			}),
		];

		const result = resolvePrompt("base", prompts);
		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]?.name).toBe("role");
		expect(result.resolvedFrom).toEqual(["base"]);
	});

	it("inherits parent sections", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "Base role" },
					{ name: "constraints", body: "Base constraints" },
				],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "quality-gates", body: "Run tests" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(3);
		expect(result.sections[0]?.name).toBe("role");
		expect(result.sections[1]?.name).toBe("constraints");
		expect(result.sections[2]?.name).toBe("quality-gates");
		expect(result.resolvedFrom).toEqual(["base", "child"]);
	});

	it("child overrides parent sections", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [{ name: "role", body: "Base role" }],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "role", body: "Child role" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.body).toBe("Child role");
	});

	it("empty body removes inherited section", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "Base role" },
					{ name: "quality-gates", body: "Run tests" },
				],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "quality-gates", body: "" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.name).toBe("role");
	});

	it("detects circular inheritance", () => {
		const prompts: Prompt[] = [
			makePrompt({ id: "p-0001", name: "a", extends: "b", sections: [] }),
			makePrompt({ id: "p-0002", name: "b", extends: "a", sections: [] }),
		];

		expect(() => resolvePrompt("a", prompts)).toThrow(/Circular inheritance/);
	});

	it("enforces depth limit", () => {
		const prompts: Prompt[] = [];
		for (let i = 0; i <= 6; i++) {
			prompts.push(
				makePrompt({
					id: `p-${i.toString().padStart(4, "0")}`,
					name: `level-${i}`,
					extends: i > 0 ? `level-${i - 1}` : undefined,
					sections: [],
				}),
			);
		}

		expect(() => resolvePrompt("level-6", prompts)).toThrow(/depth limit/i);
	});

	it("resolves specific version", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				version: 1,
				sections: [{ name: "role", body: "v1 role" }],
			}),
			makePrompt({
				id: "p-0001",
				name: "base",
				version: 2,
				sections: [{ name: "role", body: "v2 role" }],
			}),
		];

		const result = resolvePrompt("base", prompts, 1);
		expect(result.sections[0]?.body).toBe("v1 role");
		expect(result.version).toBe(1);
	});

	it("throws for missing prompt", () => {
		expect(() => resolvePrompt("nonexistent", [])).toThrow(/not found/);
	});

	describe("mixins", () => {
		it("applies mixin sections on top of own sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "caution", body: "Be careful." }],
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait-a"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.sections[0]?.name).toBe("caution");
			expect(result.sections[1]?.name).toBe("role");
			expect(result.resolvedFrom).toEqual(["trait-a", "child"]);
		});

		it("later mixin overrides earlier mixin sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "style", body: "Verbose" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-b",
					sections: [{ name: "style", body: "Concise" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					mixins: ["trait-a", "trait-b"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.sections[0]?.body).toBe("Concise");
			expect(result.sections[1]?.name).toBe("role");
		});

		it("focal prompt overrides mixin sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "role", body: "Trait role" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait-a"],
					sections: [{ name: "role", body: "My role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0]?.body).toBe("My role");
		});

		it("combines extends and mixins (extends first, then mixins, then focal)", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [
						{ name: "role", body: "Base role" },
						{ name: "constraints", body: "Base constraints" },
					],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-review",
					sections: [{ name: "review-style", body: "Be thorough" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "trait-caution",
					sections: [{ name: "caution", body: "Be careful" }],
				}),
				makePrompt({
					id: "p-0004",
					name: "cautious-reviewer",
					extends: "base",
					mixins: ["trait-review", "trait-caution"],
					sections: [{ name: "quality-gates", body: "Run tests" }],
				}),
			];

			const result = resolvePrompt("cautious-reviewer", prompts);
			expect(result.sections).toHaveLength(5);
			expect(result.sections.map((s) => s.name)).toEqual([
				"role",
				"constraints",
				"review-style",
				"caution",
				"quality-gates",
			]);
			expect(result.resolvedFrom).toEqual([
				"base",
				"trait-review",
				"trait-caution",
				"cautious-reviewer",
			]);
		});

		it("mixin overrides parent section, focal overrides mixin", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [{ name: "role", body: "Base role" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait",
					sections: [{ name: "role", body: "Trait role" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "base",
					mixins: ["trait"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0]?.body).toBe("Child role");
		});

		it("merges frontmatter from mixins (extends → mixins → focal)", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.5 },
				}),
				makePrompt({
					id: "p-0002",
					name: "trait",
					sections: [],
					frontmatter: { temperature: 0.9, topP: 0.95 },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "base",
					mixins: ["trait"],
					sections: [],
					frontmatter: { maxTokens: 2000 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({
				model: "claude-3",
				temperature: 0.9,
				topP: 0.95,
				maxTokens: 2000,
			});
		});

		it("detects circular reference via mixin", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "a",
					mixins: ["b"],
					sections: [],
				}),
				makePrompt({
					id: "p-0002",
					name: "b",
					mixins: ["a"],
					sections: [],
				}),
			];

			expect(() => resolvePrompt("a", prompts)).toThrow(/Circular inheritance/);
		});

		it("handles mixin with its own extends chain", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-base",
					sections: [{ name: "trait-core", body: "Core trait" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-ext",
					extends: "trait-base",
					sections: [{ name: "trait-extra", body: "Extra trait" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					mixins: ["trait-ext"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(3);
			expect(result.sections.map((s) => s.name)).toEqual(["trait-core", "trait-extra", "role"]);
			expect(result.resolvedFrom).toEqual(["trait-base", "trait-ext", "child"]);
		});

		it("throws for missing mixin prompt", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "child",
					mixins: ["nonexistent"],
					sections: [],
				}),
			];

			expect(() => resolvePrompt("child", prompts)).toThrow(/not found/);
		});
	});

	describe("frontmatter merging", () => {
		it("returns own frontmatter when no parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3", temperature: 0.7 });
		});

		it("inherits parent frontmatter", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3", temperature: 0.7 });
		});

		it("child frontmatter overrides parent keys", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: { model: "claude-opus-4" },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-opus-4", temperature: 0.7 });
		});

		it("mixed: some keys inherited, some overridden, some new", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.5, maxTokens: 1000 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: { temperature: 0.9, topP: 0.95 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({
				model: "claude-3",
				temperature: 0.9,
				maxTokens: 1000,
				topP: 0.95,
			});
		});

		it("empty frontmatter on child still inherits parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3" },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: {},
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3" });
		});

		it("prompt without frontmatter field returns {}", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.frontmatter).toEqual({});
		});
	});

	describe("atlas resolution", () => {
		it("omits atlas when no role declares it", () => {
			const prompts: Prompt[] = [
				makePrompt({ id: "p-0001", name: "base", sections: [] }),
				makePrompt({ id: "p-0002", name: "child", extends: "base", sections: [] }),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toBeUndefined();
			expect("atlas" in result).toBe(false);
		});

		it("returns own atlas when no parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: {
						prime: { domains: ["beacon"], files: ["src/render.ts"] },
						budget: 5000,
						on_empty: "warn",
					},
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.atlas).toEqual({
				prime: { domains: ["beacon"], files: ["src/render.ts"] },
				budget: 5000,
				on_empty: "warn",
			});
		});

		it("child atlas wholesale overrides parent without extends_atlas", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: {
						prime: { domains: ["base-domain"], files: ["base.ts"] },
						budget: 1000,
						on_empty: "error",
					},
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					atlas: { prime: { domains: ["child-domain"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({ prime: { domains: ["child-domain"] } });
		});

		it("child without atlas and without extends_atlas yields undefined (no inheritance)", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: { prime: { domains: ["base-domain"] }, budget: 1000 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toBeUndefined();
			expect("atlas" in result).toBe(false);
		});

		it("extends_atlas=true unions domains/files and last-wins budget/on_empty", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: {
						prime: { domains: ["a", "b"], files: ["x.ts"] },
						budget: 1000,
						on_empty: "error",
					},
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_atlas: true,
					sections: [],
					atlas: {
						prime: { domains: ["b", "c"], files: ["y.ts"] },
						budget: 2000,
					},
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({
				prime: { domains: ["a", "b", "c"], files: ["x.ts", "y.ts"] },
				budget: 2000,
				on_empty: "error",
			});
		});

		it("extends_atlas=true with no own atlas inherits parent unchanged", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: { prime: { domains: ["a"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_atlas: true,
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({ prime: { domains: ["a"] }, budget: 100 });
		});

		it("multi-level inheritance applies merge semantics pairwise", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "grand",
					sections: [],
					atlas: { prime: { domains: ["g"] }, budget: 100, on_empty: "error" },
				}),
				makePrompt({
					id: "p-0002",
					name: "parent",
					extends: "grand",
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["p"] }, budget: 200 },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "parent",
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["c"], files: ["c.ts"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({
				prime: { domains: ["g", "p", "c"], files: ["c.ts"] },
				budget: 200,
				on_empty: "error",
			});
		});

		it("multi-level: middle layer without extends_atlas breaks the chain", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "grand",
					sections: [],
					atlas: { prime: { domains: ["g"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "parent",
					extends: "grand",
					sections: [],
					atlas: { prime: { domains: ["p"] } },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "parent",
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["c"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({
				prime: { domains: ["p", "c"] },
			});
		});

		it("extends_atlas=true unions mixin contributions with parent and focal", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: { prime: { domains: ["base-d"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-a",
					sections: [],
					atlas: { prime: { domains: ["trait-a-d"], files: ["a.ts"] }, budget: 500 },
				}),
				makePrompt({
					id: "p-0003",
					name: "trait-b",
					sections: [],
					atlas: { prime: { files: ["b.ts"] }, on_empty: "skip" },
				}),
				makePrompt({
					id: "p-0004",
					name: "child",
					extends: "base",
					mixins: ["trait-a", "trait-b"],
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["child-d"] }, budget: 999 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({
				prime: {
					domains: ["base-d", "trait-a-d", "child-d"],
					files: ["a.ts", "b.ts"],
				},
				budget: 999,
				on_empty: "skip",
			});
		});

		it("without extends_atlas, mixin atlas is ignored even if focal has none", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait",
					sections: [],
					atlas: { prime: { domains: ["t"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait"],
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toBeUndefined();
		});

		it("without extends_atlas, focal atlas wins over mixin atlas", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait",
					sections: [],
					atlas: { prime: { domains: ["trait-d"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait"],
					sections: [],
					atlas: { prime: { domains: ["child-d"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas).toEqual({ prime: { domains: ["child-d"] } });
		});

		it("preserves order and dedupes within union", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					atlas: { prime: { domains: ["a", "b", "c"], files: ["x", "y"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_atlas: true,
					sections: [],
					atlas: { prime: { domains: ["b", "d", "a"], files: ["y", "z"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.atlas?.prime?.domains).toEqual(["a", "b", "c", "d"]);
			expect(result.atlas?.prime?.files).toEqual(["x", "y", "z"]);
		});

		it("regression: prompts without atlas render unchanged", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [{ name: "role", body: "Base role" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [{ name: "extra", body: "Extra" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.atlas).toBeUndefined();
			expect("atlas" in result).toBe(false);
		});
	});
});
