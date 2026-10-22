import { join } from "node:path";
import type { Command } from "commander";
import { isQuiet, jsonOut } from "../output.ts";
import { beaconDir } from "../paths.ts";

const PRIME_FILE = "PRIME.md";

function defaultPrimeContent(compact: boolean): string {
	if (compact) {
		return compactContent();
	}
	return fullContent();
}

function compactContent(): string {
	return `# Luuna Beacon Quick Reference

\`\`\`
lb list                   # List all prompts
lb show <name>            # View prompt record
lb render <name>          # Render prompt (resolve inheritance)
lb emit <name>            # Render and write to file
lb emit --all             # Emit all active prompts
lb create --name "..."    # Create a new prompt
lb update <name>          # Update prompt (new version)
lb import <path>          # Import existing .md as prompt
lb sync                   # Stage + commit .luuna/beacon/
\`\`\`

**Do not manually edit emitted files.** Use \`lb update\` to modify prompts.
`;
}

function fullContent(): string {
	return `# Luuna Beacon Workflow Context

> **Context Recovery**: Run \`lb prime\` after compaction, clear, or new session

## Core Rules
- **Storage**: Prompts live in \`.luuna/beacon/prompts.jsonl\` — never edit this file by hand
- **Emit files are generated**: Do NOT manually edit files in the emit directory; use \`lb update\` instead
- **Composition**: Prompts are composed via sections and inheritance, not duplicated
- **Git-native**: JSONL storage is diffable/mergeable; \`merge=union\` gitattribute handles branch merges

## Essential Commands

### Viewing Prompts
- \`lb list\` — List all prompts (name, version, status, tags)
- \`lb show <name>\` — Show full prompt record (sections, metadata)
- \`lb show <name>@<v>\` — Show specific version
- \`lb render <name>\` — Render full prompt (resolves inheritance chain)
- \`lb tree <name>\` — Show inheritance tree
- \`lb history <name>\` — Show version timeline
- \`lb diff <name> <v1> <v2>\` — Section-aware diff between versions

### Creating & Updating
- \`lb create --name "..." --section "role:You are..." --tag agent\` — Create prompt
- \`lb update <name> --section "role:Updated content"\` — Update (creates new version)
- \`lb import <path>\` — Import existing .md file as a prompt
- \`lb archive <name>\` — Archive a prompt

### Emitting
- \`lb emit <name>\` — Render and write prompt to a file
- \`lb emit --all\` — Emit all active prompts
- \`lb emit --check\` — Check if emitted files are up to date

### Schemas & Validation
- \`lb schema create --name "..." --required "role,task"\` — Create validation schema
- \`lb validate <name>\` — Validate prompt against its schema
- \`lb validate --all\` — Validate all prompts with schemas

### Versioning
- \`lb pin <name>@<version>\` — Pin prompt to a specific version
- \`lb unpin <name>\` — Remove version pin

### Sync
- \`lb sync\` — Stage and commit .luuna/beacon/ changes

## Atlas Metadata

Prompts can declare atlas (expertise) dependencies inline. Luuna Beacon stores the declaration as metadata and surfaces it in the render envelope — **lb never shells out to \`luuna-atlas\`**. Consumers (warren, overstory) read the resolved \`atlas\` field and run \`luuna-atlas prime\` themselves.

Schema fields on a prompt record:
- \`atlas.prime.domains[]\` — domain names to prime
- \`atlas.prime.files[]\` — file globs that scope priming
- \`atlas.budget\` — non-negative number, consumer-defined units
- \`atlas.on_empty\` — \`"skip"\` | \`"warn"\` | \`"error"\`
- \`extends_atlas\` — boolean (default false): when true, child merges with parent's atlas (union domains/files, last-wins budget/on_empty); when false, child wholesale overrides

\`lb render <name> --json\` includes a top-level \`atlas\` field whenever any role in the chain declared one. The field is **omitted entirely** (not null, not {}) when no role declared atlas — absent vs. empty is semantically distinct.

\`lb doctor\` runs an optional \`atlas-domains\` check that warns on domains not declared in \`.luuna/atlas/config.yaml\`. The check is a typo guard, not a hard gate.

See SPEC.md "Atlas Metadata" for full semantics.

## Common Workflows

**Viewing what's available:**
\`\`\`bash
lb list                               # See all prompts
lb render <name>                      # See full rendered output
lb tree <name>                        # Understand inheritance
\`\`\`

**Creating a new prompt:**
\`\`\`bash
lb create --name "agent-v1" --section "role:You are a helpful assistant" --tag agent
lb emit agent-v1                      # Write to agents/agent-v1.md
lb sync                               # Commit changes
\`\`\`

**Updating an existing prompt:**
\`\`\`bash
lb show <name>                        # Review current state
lb update <name> --section "role:Updated instructions"
lb emit <name>                        # Re-emit with changes
lb sync                               # Commit changes
\`\`\`

**Importing from an existing file:**
\`\`\`bash
lb import path/to/prompt.md           # Import as a beacon prompt
lb emit <name>                        # Verify emit output
\`\`\`
`;
}

export default async function prime(args: string[], json: boolean): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		if (!isQuiet()) {
			process.stdout.write(`Usage: luuna-beacon prime [options]

Outputs lb workflow context for AI agent sessions.

Options:
  --compact   Output minimal quick-reference
  --export    Output default template (ignores custom PRIME.md)
  --json      Output as JSON
`);
		}
		return;
	}

	const compact = args.includes("--compact");
	const exportMode = args.includes("--export");

	// --export always outputs the default template
	if (exportMode) {
		const content = defaultPrimeContent(false);
		if (json) {
			jsonOut({ success: true, command: "prime", content });
		} else if (!isQuiet()) {
			process.stdout.write(content);
		}
		return;
	}

	// Try to find .luuna/beacon dir for custom PRIME.md
	let content: string | null = null;
	try {
		const customFile = Bun.file(join(beaconDir(process.cwd()), PRIME_FILE));
		if (await customFile.exists()) {
			content = await customFile.text();
		}
	} catch {
		// No .luuna/beacon dir — that's fine, use default
	}

	if (!content) {
		content = defaultPrimeContent(compact);
	}

	if (json) {
		jsonOut({ success: true, command: "prime", content });
	} else if (!isQuiet()) {
		process.stdout.write(content);
	}
}

export function registerPrimeCommand(program: Command): void {
	program
		.command("prime")
		.description("Output workflow context for AI agents")
		.option("--compact", "Output minimal quick-reference")
		.option("--export", "Output default template (ignores custom PRIME.md)")
		.action(async (opts: Record<string, unknown>) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [];
			if (opts.compact) args.push("--compact");
			if (opts.export) args.push("--export");
			await prime(args, json);
		});
}
