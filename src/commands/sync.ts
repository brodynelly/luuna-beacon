import type { Command } from "commander";
import { beaconDir } from "../paths.ts";
import { c, errorOut, fmt, humanOut, jsonOut } from "../output.ts";
import { ExitError } from "../types.ts";

export default async function sync(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: luuna-beacon sync [options]

Options:
  --status    Check sync status without committing
  --json      Output as JSON`);
		return;
	}

	beaconDir(cwd); // migrate a legacy layout before touching git
	const statusOnly = args.includes("--status");

	// Check git status of .luuna/beacon/
	const statusResult = Bun.spawnSync(["git", "status", "--porcelain", ".luuna/beacon/"], { cwd });

	if (statusResult.exitCode !== 0) {
		const stderr = statusResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: stderr });
		} else {
			errorOut(`git error: ${stderr}`);
		}
		throw new ExitError(1);
	}

	const statusOutput = statusResult.stdout.toString().trim();
	const changedFiles = statusOutput
		? statusOutput.split("\n").map((line) => line.trim().split(" ").pop() ?? "")
		: [];

	if (statusOnly) {
		if (json) {
			jsonOut({
				success: true,
				command: "sync",
				uncommitted: changedFiles.length > 0,
				files: changedFiles,
			});
		} else {
			if (changedFiles.length === 0) {
				humanOut(fmt.success(".luuna/beacon/ is clean (no uncommitted changes)"));
			} else {
				humanOut(fmt.warning(`${changedFiles.length} uncommitted file(s)`));
				for (const f of changedFiles) {
					humanOut(`  ${f}`);
				}
			}
		}
		return;
	}

	if (changedFiles.length === 0) {
		if (json) {
			jsonOut({ success: true, command: "sync", committed: false, message: "Nothing to commit" });
		} else {
			humanOut(c.dim("Nothing to commit in .luuna/beacon/"));
		}
		return;
	}

	// Stage .luuna/beacon/ changes
	const addResult = Bun.spawnSync(["git", "add", ".luuna/beacon/"], { cwd });
	if (addResult.exitCode !== 0) {
		const err = addResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: err });
		} else {
			errorOut(`git add failed: ${err}`);
		}
		throw new ExitError(1);
	}

	// Commit
	const msg = `luuna-beacon: sync ${new Date().toISOString().slice(0, 10)}`;
	const commitResult = Bun.spawnSync(["git", "commit", "-m", msg], { cwd });

	if (commitResult.exitCode !== 0) {
		const err = commitResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: err });
		} else {
			errorOut(`git commit failed: ${err}`);
		}
		throw new ExitError(1);
	}

	if (json) {
		jsonOut({ success: true, command: "sync", committed: true, files: changedFiles, message: msg });
	} else {
		humanOut(fmt.success(`Committed ${changedFiles.length} file(s): ${msg}`));
	}
}

export function registerSyncCommand(program: Command): void {
	program
		.command("sync")
		.description("Stage and commit .luuna/beacon/ changes")
		.option("--status", "Check sync status without committing")
		.action(async (options: { status?: boolean }) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [];
			if (options.status) args.push("--status");
			if (json) args.push("--json");
			await sync(args, json);
		});
}
