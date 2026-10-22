import type { Command } from "commander";
import {
	artifactDestination,
	exportArtifact,
	importArtifact,
	readArtifacts,
	selectArtifact,
	verifyArtifact,
	type ArtifactKind,
	type ArtifactRecord,
} from "../artifacts.ts";
import { errorOut, humanOut, jsonOut, redact } from "../output.ts";
import { ExitError } from "../types.ts";

function summary(record: ArtifactRecord): Record<string, unknown> {
	return {
		kind: record.kind,
		name: record.name,
		version: record.version,
		sha256: record.sha256,
		files: record.files.length,
		createdAt: record.createdAt,
	};
}

function latestArtifacts(records: ArtifactRecord[]): ArtifactRecord[] {
	const latest = new Map<string, ArtifactRecord>();
	for (const record of records) {
		const previous = latest.get(record.name);
		if (!previous || record.version > previous.version) latest.set(record.name, record);
	}
	return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function printArtifactList(kind: ArtifactKind, artifacts: ArtifactRecord[]): void {
	if (artifacts.length === 0) {
		humanOut(`No ${kind} artifacts found.`);
		return;
	}
	for (const artifact of artifacts) humanOut(`${artifact.name}@${artifact.version}  ${artifact.files.length} files  ${artifact.sha256.slice(0, 12)}`);
}

async function run(command: string, json: boolean, operation: () => Promise<void>): Promise<void> {
	try {
		await operation();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (json) jsonOut({ success: false, command, error: message });
		else errorOut(message);
		throw new ExitError(1);
	}
}

function registerKind(program: Command, kind: ArtifactKind): void {
	const group = program.command(kind).description(`Manage versioned ${kind} artifacts`);

	group
		.command("import <path>")
		.description(`Capture a complete ${kind} from a local source`)
		.requiredOption("--name <name>", "Artifact name")
		.action(async (path: string, options: { name: string }) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} import`, json, async () => {
				const record = await importArtifact(process.cwd(), kind, options.name, path);
				if (json) jsonOut({ success: true, command: `${kind} import`, artifact: summary(record) });
				else humanOut(`Stored ${kind} ${record.name}@${record.version} (${record.files.length} files)`);
			});
		});

	group
		.command("update <name> <path>")
		.description(`Capture a new ${kind} version from a local source`)
		.action(async (name: string, path: string) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} update`, json, async () => {
				const record = await importArtifact(process.cwd(), kind, name, path);
				if (json) jsonOut({ success: true, command: `${kind} update`, artifact: summary(record) });
				else humanOut(`Stored ${kind} ${record.name}@${record.version} (${record.files.length} files)`);
			});
		});

	group
		.command("list")
		.description(`List stored ${kind} artifacts`)
		.action(async () => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} list`, json, async () => {
				const records = (await readArtifacts(process.cwd())).filter((record) => record.kind === kind);
				const artifacts = latestArtifacts(records);
				if (json) jsonOut({ success: true, command: `${kind} list`, artifacts: artifacts.map(summary), count: artifacts.length });
				else printArtifactList(kind, artifacts);
			});
		});

	group
		.command("show <name>")
		.description(`Show a ${kind} version and its stored files`)
		.action(async (name: string) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} show`, json, async () => {
				const artifact = selectArtifact(await readArtifacts(process.cwd()), kind, name);
				const files = artifact.files.map(({ path, encoding, sha256, executable }) => ({ path, encoding, sha256, executable }));
				if (json) jsonOut({ success: true, command: `${kind} show`, artifact: { ...summary(artifact), files } });
				else {
					humanOut(`${kind} ${artifact.name}@${artifact.version}  ${artifact.sha256}`);
					for (const file of files) humanOut(`  ${file.path}  ${file.sha256.slice(0, 12)}${file.executable ? " executable" : ""}`);
				}
			});
		});

	group
		.command("history <name>")
		.description(`List all stored versions of a ${kind}`)
		.action(async (name: string) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} history`, json, async () => {
				const current = selectArtifact(await readArtifacts(process.cwd()), kind, name);
				const versions = (await readArtifacts(process.cwd()))
					.filter((record) => record.kind === kind && record.name === current.name)
					.sort((a, b) => a.version - b.version);
				if (json) jsonOut({ success: true, command: `${kind} history`, versions: versions.map(summary) });
				else for (const version of versions) humanOut(`${version.name}@${version.version}  ${version.sha256.slice(0, 12)}  ${version.createdAt}`);
			});
		});

	group
		.command("read <name> <file>")
		.description(`Read one embedded file from a ${kind}`)
		.action(async (name: string, path: string) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} read`, json, async () => {
				const record = selectArtifact(await readArtifacts(process.cwd()), kind, name);
				const file = record.files.find((entry) => entry.path === path);
				if (!file) throw new Error(`Embedded file '${path}' not found`);
				if (json) jsonOut({ success: true, command: `${kind} read`, name: record.name, version: record.version, file });
				else if (file.encoding === "utf8") humanOut(redact(file.content));
				else throw new Error("Binary file: use --json to read base64 content");
			});
		});

	group
		.command("verify [name]")
		.description(`Verify stored ${kind} content and hashes`)
		.action(async (name?: string) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} verify`, json, async () => {
				const records = (await readArtifacts(process.cwd())).filter((record) => record.kind === kind);
				const selected = name ? [selectArtifact(records, kind, name)] : records;
				for (const record of selected) verifyArtifact(record);
				if (json) jsonOut({ success: true, command: `${kind} verify`, checked: selected.length });
				else humanOut(`Verified ${selected.length} ${kind} version(s)`);
			});
		});

	group
		.command("export <name>")
		.description(`Reconstruct a ${kind} from its stored version`)
		.option("--out <path>", "Explicit destination file or directory")
		.option("--target <target>", "Host layout: claude or codex where supported")
		.option("--force", "Replace an existing destination")
		.action(async (name: string, options: { out?: string; target?: string; force?: boolean }) => {
			const json: boolean = program.opts().json ?? false;
			await run(`${kind} export`, json, async () => {
				const cwd = process.cwd();
				const record = selectArtifact(await readArtifacts(cwd), kind, name);
				const destination = artifactDestination(cwd, record, options.target, options.out);
				const result = exportArtifact(cwd, record, destination, options.force ?? false);
				if (json) jsonOut({ success: true, command: `${kind} export`, name: record.name, version: record.version, path: result.path });
				else humanOut(`Exported ${kind} ${record.name}@${record.version} to ${result.path}`);
			});
		});
}

export function registerArtifactCommands(program: Command): void {
	registerKind(program, "skill");
	registerKind(program, "agent");
	registerKind(program, "bundle");
}
