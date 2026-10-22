// JSON Schema for `.luuna/beacon/config.yaml`. Wire-format contract for
// schema-driven config UIs: a client reads this schema,
// renders a form, and writes back via `luuna-beacon config set <path> <value>`. Locked
// with a golden test (config-schema.test.ts) so any shape change is intentional.
//
// Describes the **canonical** shape produced by loadConfig in src/config.ts:
// `project`, `version`, and a `targets` map of named EmitTargets. The loader
// transparently migrates legacy `emitDir`/`emitDirByTag` configs to this shape
// on read; the first `luuna-beacon config set` rewrites the file in the canonical form.
// Legacy fields are intentionally absent so config UIs do not surface
// deprecated knobs.

type JSONSchema = Record<string, unknown>;

export function configSchema(): JSONSchema {
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://github.com/brodynelly/luuna-beacon/config.schema.json",
		title: "Luuna Beacon project config",
		description:
			"Schema for .luuna/beacon/config.yaml. Consumed by schema-driven config UIs; emit via `luuna-beacon config schema`.",
		type: "object",
		required: ["project", "version"],
		additionalProperties: false,
		properties: {
			project: {
				type: "string",
				minLength: 1,
				title: "Project name",
				description: "Human-readable project identifier surfaced in `luuna-beacon list` and consuming tools.",
			},
			version: {
				type: "string",
				title: "Config schema version",
				description: "Internal version tag for the config layout. Bumped when the schema breaks.",
				default: "1",
			},
			targets: {
				type: "object",
				title: "Emit targets",
				description:
					"Map of target name → emit target. `luuna-beacon emit` resolves a prompt to a target by matching tags, falling back to the target marked `default: true`.",
				additionalProperties: { $ref: "#/$defs/EmitTarget" },
				examples: [
					{
						default: { dir: "agents", default: true },
						docs: { dir: "docs/prompts", tags: ["doc"] },
					},
				],
			},
		},
		$defs: {
			EmitTarget: {
				type: "object",
				required: ["dir"],
				additionalProperties: false,
				properties: {
					dir: {
						type: "string",
						minLength: 1,
						title: "Directory",
						description:
							"Output directory (relative to the repo root) where prompts emitted to this target are written.",
					},
					default: {
						type: "boolean",
						title: "Default target",
						description:
							"When true, prompts with no matching tag-based target are emitted here. At most one target should set this.",
					},
					tags: {
						type: "array",
						items: { type: "string", minLength: 1 },
						title: "Tags",
						description: "Prompts whose `tags` include any of these are routed to this target.",
					},
				},
			},
		},
	};
}
