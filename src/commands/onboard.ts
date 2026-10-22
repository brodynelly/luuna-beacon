import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { detectStatus, replaceMarkerSection, VERSION_MARKER, wrapInMarkers } from "../markers.ts";
import { humanOut, isQuiet, jsonOut } from "../output.ts";

const CANDIDATE_FILES = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"] as const;

function onboardSnippet(): string {
	return `## Prompt Management (Luuna Beacon)
${VERSION_MARKER}

This project uses Luuna Beacon (\`lbc\`) for git-native prompt management.

**At the start of every session**, run:
\`\`\`
lbc prime
\`\`\`

This injects prompt workflow context: commands, conventions, and common workflows.

**Quick reference:**
- \`lbc list\` — List all prompts
- \`lbc render <name>\` — View rendered prompt (resolves inheritance)
- \`lbc emit --all\` — Render prompts to files
- \`lbc update <name>\` — Update a prompt (creates new version)
- \`lbc sync\` — Stage and commit .luuna/beacon/ changes

**Do not manually edit emitted files.** Use \`lbc update\` to modify prompts, then \`lbc emit\` to regenerate.

**Atlas metadata:** Prompts can declare expertise dependencies via \`atlas.prime.domains\`, \`atlas.prime.files\`, \`atlas.budget\`, \`atlas.on_empty\`, plus a top-level \`extends_atlas\` flag (override-by-default; merge with parent when \`true\`). Luuna Beacon never shells out to \`luuna-atlas\` — \`lbc render --json\` surfaces the resolved declaration in a top-level \`atlas\` field for consumers to act on. See SPEC.md "Atlas Metadata".`;
}

function findTargetFile(projectRoot: string): string | null {
	for (const candidate of CANDIDATE_FILES) {
		const fullPath = join(projectRoot, candidate);
		if (existsSync(fullPath)) {
			return fullPath;
		}
	}
	return null;
}

export default async function onboard(args: string[], json: boolean): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: luuna-beacon onboard [options]

Adds a Luuna Beacon section to CLAUDE.md (or creates it) so AI agents discover prompt workflows.

Options:
  --check     Report status without writing (missing, current, outdated)
  --stdout    Print snippet to stdout without writing to file
  --json      Output as JSON`);
		return;
	}

	const stdoutMode = args.includes("--stdout");
	const checkMode = args.includes("--check");
	const cwd = process.cwd();

	const targetPath = findTargetFile(cwd);
	const snippet = onboardSnippet();

	// --check mode: report status only
	if (checkMode) {
		if (!targetPath) {
			if (json) {
				jsonOut({ success: true, command: "onboard", status: "missing", file: null });
			} else {
				humanOut("Status: missing (no CLAUDE.md found)");
			}
			return;
		}
		const content = await Bun.file(targetPath).text();
		const status = detectStatus(content);
		if (json) {
			jsonOut({ success: true, command: "onboard", status, file: targetPath });
		} else {
			humanOut(`Status: ${status} (${targetPath})`);
		}
		return;
	}

	// --stdout mode: print what would be written
	if (stdoutMode) {
		if (!isQuiet()) {
			process.stdout.write(wrapInMarkers(snippet));
			process.stdout.write("\n");
		}
		return;
	}

	// Default mode: write to file
	const filePath = targetPath ?? join(cwd, "CLAUDE.md");
	const fileExists = existsSync(filePath);
	const wrappedSnippet = wrapInMarkers(snippet);

	if (!fileExists) {
		await Bun.write(filePath, `${wrappedSnippet}\n`);
		if (json) {
			jsonOut({ success: true, command: "onboard", action: "created", file: filePath });
		} else {
			humanOut(`Created ${filePath} with Luuna Beacon section`);
		}
		return;
	}

	const content = await Bun.file(filePath).text();
	const status = detectStatus(content);

	if (status === "current") {
		if (json) {
			jsonOut({ success: true, command: "onboard", action: "unchanged", file: filePath });
		} else {
			humanOut("Luuna Beacon section is already up to date");
		}
		return;
	}

	if (status === "outdated") {
		const updated = replaceMarkerSection(content, snippet);
		if (updated) {
			await Bun.write(filePath, updated);
			if (json) {
				jsonOut({ success: true, command: "onboard", action: "updated", file: filePath });
			} else {
				humanOut(`Updated Luuna Beacon section in ${filePath}`);
			}
		}
		return;
	}

	// status === "missing": append
	const separator = content.endsWith("\n") ? "\n" : "\n\n";
	await Bun.write(filePath, `${content}${separator}${wrappedSnippet}\n`);
	if (json) {
		jsonOut({ success: true, command: "onboard", action: "appended", file: filePath });
	} else {
		humanOut(`Added Luuna Beacon section to ${filePath}`);
	}
}

export function registerOnboardCommand(program: Command): void {
	program
		.command("onboard")
		.description("Add Luuna Beacon section to CLAUDE.md for AI agent discovery")
		.option("--check", "Report status without writing (missing, current, outdated)")
		.option("--stdout", "Print snippet to stdout without writing to file")
		.action(async (opts: Record<string, unknown>) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [];
			if (opts.check) args.push("--check");
			if (opts.stdout) args.push("--stdout");
			await onboard(args, json);
		});
}
