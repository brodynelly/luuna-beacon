import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { migrateLegacyLayout } from "../legacy-layout.ts";
import { saveConfig } from "../config.ts";
import { errorOut, humanOut, jsonOut } from "../output.ts";
import { ExitError } from "../types.ts";

export default async function init(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();

	if (_args.includes("--help") || _args.includes("-h")) {
		humanOut(`Usage: luuna-beacon init

Initializes .luuna/beacon/ in the current directory with config and empty JSONL stores.`);
		return;
	}

	const dataDir = join(cwd, ".luuna", "beacon");
	migrateLegacyLayout(cwd);
	if (existsSync(dataDir)) {
		if (json) {
			jsonOut({ success: false, command: "init", error: ".luuna/beacon/ already exists" });
		} else {
			errorOut(".luuna/beacon/ already exists");
		}
		throw new ExitError(1);
	}

	mkdirSync(dataDir, { recursive: true });

	// Write default config
	await saveConfig(cwd, {
		project: "luuna-beacon",
		version: "1",
		targets: {
			default: { dir: "agents", default: true },
		},
	});

	// Write .gitignore for .luuna/beacon/
	await Bun.write(join(dataDir, ".gitignore"), "*.lock\n");

	// Create empty JSONL files
	await Bun.write(join(dataDir, "prompts.jsonl"), "");
	await Bun.write(join(dataDir, "schemas.jsonl"), "");
	await Bun.write(join(dataDir, "artifacts.jsonl"), "");

	// Append .gitattributes to project root
	const gitattrsPath = join(cwd, ".gitattributes");
	const gitattrsEntry = ".luuna/beacon/prompts.jsonl merge=union\n.luuna/beacon/schemas.jsonl merge=union\n.luuna/beacon/artifacts.jsonl merge=union\n";

	let existing = "";
	try {
		existing = await Bun.file(gitattrsPath).text();
	} catch {
		existing = "";
	}

	if (!existing.includes(".luuna/beacon/prompts.jsonl")) {
		await Bun.write(gitattrsPath, existing + gitattrsEntry);
	} else if (!existing.includes(".luuna/beacon/artifacts.jsonl")) {
		await Bun.write(gitattrsPath, `${existing}${existing.endsWith("\n") ? "" : "\n"}.luuna/beacon/artifacts.jsonl merge=union\n`);
	}

	if (json) {
		jsonOut({ success: true, command: "init", dir: dataDir });
	} else {
		humanOut(`Initialized .luuna/beacon/ in ${cwd}`);
		humanOut("  config.yaml: project=luuna-beacon, targets: default → agents/");
		humanOut("  prompts.jsonl created");
		humanOut("  schemas.jsonl created");
		humanOut("  artifacts.jsonl created");
		humanOut("  .gitattributes updated with merge=union");
	}
}

export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("Initialize .luuna/beacon/ in current directory")
		.action(async () => {
			const json: boolean = program.opts().json ?? false;
			const args = json ? ["--json"] : [];
			await init(args, json);
		});
}
