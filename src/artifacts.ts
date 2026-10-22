import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { acquireLock, appendJsonl, releaseLock } from "./store.ts";
import { beaconDir } from "./paths.ts";

export type ArtifactKind = "skill" | "agent" | "bundle";
export type ArtifactEncoding = "utf8" | "base64";

export interface ArtifactFile {
	path: string;
	encoding: ArtifactEncoding;
	content: string;
	sha256: string;
	executable: boolean;
}

export interface ArtifactRecord {
	id: string;
	kind: ArtifactKind;
	name: string;
	version: number;
	files: ArtifactFile[];
	sha256: string;
	createdAt: string;
}

const MAX_FILES = 256;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const FORBIDDEN_DIRS = new Set([".git", "node_modules", ".luuna"]);
const ARTIFACT_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HASH = /^[0-9a-f]{64}$/;
const EXPORT_MARKER = ".lbc-artifact.json";

function digest(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function artifactsFile(cwd: string): string {
	return join(beaconDir(cwd), "artifacts.jsonl");
}

export function validateArtifactName(name: string): void {
	if (!ARTIFACT_NAME.test(name) || name === "." || name === "..") {
		throw new Error("Artifact name must be 1-80 lowercase letters, digits, dots, dashes, or underscores, beginning with a letter or digit");
	}
}

export function validateArtifactPath(path: string): void {
	if (
		!path ||
		path.includes("\\") ||
		path.includes("\0") ||
		isAbsolute(path) ||
		path.startsWith("/") ||
		path.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new Error(`Invalid artifact path: ${path}`);
	}
}

function manifestHash(files: ArtifactFile[]): string {
	return digest(JSON.stringify(files.map(({ path, sha256, executable }) => ({ path, sha256, executable }))));
}

function decodeFile(file: ArtifactFile): Uint8Array {
	if (file.encoding === "utf8") return Buffer.from(file.content, "utf8");
	if (file.encoding !== "base64" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) {
		throw new Error(`Invalid encoding for ${file.path}`);
	}
	const bytes = Buffer.from(file.content, "base64");
	if (bytes.toString("base64") !== file.content) throw new Error(`Invalid base64 for ${file.path}`);
	return bytes;
}

function verifyFiles(files: ArtifactFile[]): void {
	if (files.length === 0 || files.length > MAX_FILES) throw new Error("Invalid artifact file count");
	let total = 0;
	let last = "";
	for (const file of files) {
		validateArtifactPath(file.path);
		if (file.path <= last) throw new Error(`Duplicate or unsorted artifact path: ${file.path}`);
		if (file.path === EXPORT_MARKER) throw new Error("Artifact contains reserved export marker");
		last = file.path;
		verifyFileMetadata(file);
		const bytes = decodeFile(file);
		if (bytes.length > MAX_FILE_BYTES) throw new Error(`Artifact file exceeds ${MAX_FILE_BYTES} bytes: ${file.path}`);
		total += bytes.length;
		if (total > MAX_BYTES) throw new Error(`Artifact exceeds ${MAX_BYTES} bytes`);
		if (digest(bytes) !== file.sha256) throw new Error(`Artifact hash mismatch: ${file.path}`);
	}
}

function verifyFileMetadata(file: ArtifactFile): void {
	if (!HASH.test(file.sha256) || typeof file.executable !== "boolean") throw new Error(`Invalid metadata for ${file.path}`);
}

function verifyPluginManifest(files: ArtifactFile[]): void {
	const manifest = files.find((file) => file.path === ".claude-plugin/plugin.json");
	if (manifest?.encoding !== "utf8") throw new Error("Bundle must contain a UTF-8 .claude-plugin/plugin.json");
	try {
		const parsed = JSON.parse(manifest.content) as unknown;
		if (!parsed || typeof parsed !== "object" || typeof (parsed as { name?: unknown }).name !== "string") throw new Error("name missing");
	} catch {
		throw new Error("Plugin manifest must be valid JSON with a name");
	}
}

function verifyKindFiles(record: ArtifactRecord): void {
	switch (record.kind) {
		case "skill": {
			const entry = record.files.find((file) => file.path === "SKILL.md");
			if (entry?.encoding !== "utf8") throw new Error("Skill must contain UTF-8 SKILL.md at its root");
			break;
		}
		case "agent":
			if (record.files.length !== 1 || record.files[0]?.path !== "AGENT.md" || record.files[0]?.encoding !== "utf8") {
				throw new Error("Agent must contain one UTF-8 Markdown definition");
			}
			break;
		case "bundle":
			verifyPluginManifest(record.files);
			break;
	}
}

export function verifyArtifact(record: ArtifactRecord): void {
	if (!record || !["skill", "agent", "bundle"].includes(record.kind)) throw new Error("Invalid artifact kind");
	validateArtifactName(record.name);
	if (!record.id || !Number.isSafeInteger(record.version) || record.version < 1 || !Array.isArray(record.files)) {
		throw new Error("Invalid artifact record");
	}
	verifyFiles(record.files);
	verifyKindFiles(record);
	if (manifestHash(record.files) !== record.sha256) throw new Error("Artifact manifest hash mismatch");
}

function encodeFile(path: string, bytes: Uint8Array, executable: boolean): ArtifactFile {
	const utf8 = new TextDecoder("utf-8", { fatal: true });
	let content: string;
	let encoding: ArtifactEncoding;
	try {
		content = utf8.decode(bytes);
		if (content.includes("\0")) throw new Error("binary");
		encoding = "utf8";
	} catch {
		content = Buffer.from(bytes).toString("base64");
		encoding = "base64";
	}
	return { path, encoding, content, sha256: digest(bytes), executable };
}

function collectDirectory(source: string, directory: string, add: (absolute: string, logical: string) => void): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = join(directory, entry.name);
		const logical = relative(source, absolute).split(sep).join("/");
		validateArtifactPath(logical);
		if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${logical}`);
		if (entry.isDirectory()) {
			if (FORBIDDEN_DIRS.has(entry.name)) throw new Error(`Remove generated or private directory before import: ${logical}`);
			collectDirectory(source, absolute, add);
		} else if (entry.isFile()) add(absolute, logical);
		else throw new Error(`Unsupported source entry: ${logical}`);
	}
}

export function snapshotArtifact(kind: ArtifactKind, name: string, inputPath: string): ArtifactFile[] {
	validateArtifactName(name);
	const source = resolve(inputPath);
	if (!existsSync(source) || lstatSync(source).isSymbolicLink()) throw new Error("Source must exist and must not be a symbolic link");
	const files: ArtifactFile[] = [];
	let total = 0;
	const add = (absolute: string, logical: string): void => {
		validateArtifactPath(logical);
		if (logical === EXPORT_MARKER) throw new Error("Reserved export marker cannot be imported");
		const base = basename(logical).toLowerCase();
		if ((base.startsWith(".env") && !base.endsWith(".example")) || [".npmrc", ".pypirc", "id_rsa", "id_ed25519"].includes(base) || /\.(?:pem|p12|pfx|key)$/i.test(base)) {
			throw new Error(`Refusing to store a credential-like file: ${logical}`);
		}
		const stat = lstatSync(absolute);
		if (!stat.isFile()) throw new Error(`Unsupported source entry: ${logical}`);
		if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes: ${logical}`);
		const bytes = readFileSync(absolute);
		total += bytes.length;
		if (total > MAX_BYTES || files.length >= MAX_FILES) throw new Error("Artifact size or file count limit exceeded");
		files.push(encodeFile(logical, bytes, (stat.mode & 0o111) !== 0));
	};
	if (kind === "agent") {
		if (!lstatSync(source).isFile() || !source.toLowerCase().endsWith(".md")) throw new Error("Agent source must be a Markdown file");
		add(source, "AGENT.md");
	} else {
		if (!lstatSync(source).isDirectory()) throw new Error(`${kind} source must be a directory`);
		collectDirectory(source, source, add);
	}
	files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	const candidate: ArtifactRecord = {
		id: randomUUID(), kind, name, version: 1, files,
		sha256: manifestHash(files), createdAt: new Date().toISOString(),
	};
	verifyArtifact(candidate);
	return files;
}

export async function readArtifacts(cwd: string): Promise<ArtifactRecord[]> {
	const path = artifactsFile(cwd);
	if (!existsSync(path)) return [];
	const text = await Bun.file(path).text();
	const records: ArtifactRecord[] = [];
	const seen = new Map<string, string>();
	for (const [index, line] of text.split("\n").entries()) {
		if (!line.trim()) continue;
		let record: ArtifactRecord;
		try {
			record = JSON.parse(line) as ArtifactRecord;
			verifyArtifact(record);
		} catch (error) {
			throw new Error(`Invalid artifacts.jsonl line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
		}
		const key = `${record.kind}\0${record.name}\0${record.version}`;
		const previous = seen.get(key);
		if (previous && previous !== record.sha256) throw new Error(`Conflicting artifact version: ${record.kind} ${record.name}@${record.version}`);
		if (!previous) records.push(record);
		seen.set(key, record.sha256);
	}
	return records;
}

export function selectArtifact(records: ArtifactRecord[], kind: ArtifactKind, nameArg: string): ArtifactRecord {
	const match = /^(.*?)(?:@([1-9][0-9]*))?$/.exec(nameArg);
	const name = match?.[1] ?? "";
	validateArtifactName(name);
	const version = match?.[2] ? Number(match[2]) : undefined;
	const found = records.filter((record) => record.kind === kind && record.name === name && (version === undefined || record.version === version));
	if (found.length === 0) throw new Error(`${kind} '${nameArg}' not found`);
	return found.sort((a, b) => b.version - a.version)[0] as ArtifactRecord;
}

export async function importArtifact(cwd: string, kind: ArtifactKind, name: string, source: string): Promise<ArtifactRecord> {
	if (!existsSync(join(beaconDir(cwd), "config.yaml"))) throw new Error("Beacon project is not initialized; run lbc init first");
	const sourcePath = resolve(source);
	const dataPath = resolve(beaconDir(cwd));
	if (sourcePath === dataPath || sourcePath.startsWith(`${dataPath}${sep}`)) throw new Error("Cannot import Beacon project data as an artifact");
	const files = snapshotArtifact(kind, name, source);
	const path = artifactsFile(cwd);
	mkdirSync(dirname(path), { recursive: true });
	await acquireLock(path);
	try {
		const records = await readArtifacts(cwd);
		const versions = records.filter((record) => record.kind === kind && record.name === name);
		const previous = versions.sort((a, b) => b.version - a.version)[0];
		const sha256 = manifestHash(files);
		if (previous?.sha256 === sha256) return previous;
		const record: ArtifactRecord = {
			id: previous?.id ?? randomUUID(), kind, name,
			version: (previous?.version ?? 0) + 1,
			files, sha256, createdAt: new Date().toISOString(),
		};
		await appendJsonl(path, record);
		return record;
	} finally {
		releaseLock(path);
	}
}

export function artifactDestination(cwd: string, record: ArtifactRecord, target?: string, out?: string): string {
	if (target && out) throw new Error("Use --target or --out, not both");
	if (out) return resolve(out);
	if (target === "claude") {
		if (record.kind === "skill") return resolve(cwd, ".claude", "skills", record.name);
		if (record.kind === "agent") return resolve(cwd, ".claude", "agents", `${record.name}.md`);
		throw new Error("Bundle export requires --out; loading a plugin is managed by Claude Code");
	}
	if (target === "codex" && record.kind === "skill") return resolve(cwd, ".agents", "skills", record.name);
	if (target) throw new Error(`Target '${target}' is unsupported for ${record.kind}`);
	throw new Error("Specify --out or --target");
}

function guardDestination(destination: string, cwd: string): void {
	const root = resolve(cwd);
	const resolved = resolve(destination);
	const dataRoot = resolve(root, ".luuna");
	if (resolved === root || resolved === dataRoot || resolved.startsWith(`${dataRoot}${sep}`)) {
		throw new Error("Refusing to export over a project or Beacon data directory");
	}
	let parent = dirname(resolved);
	while (parent !== dirname(parent)) {
		if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error("Export parent must not be a symbolic link");
		parent = dirname(parent);
	}
	if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) throw new Error("Export destination must not be a symbolic link");
}

function writeStage(stage: string, record: ArtifactRecord, singleAgent: boolean): void {
	if (singleAgent) {
		writeFileSync(stage, decodeFile(record.files[0] as ArtifactFile));
		return;
	}
	mkdirSync(stage);
	for (const file of record.files) {
		const output = join(stage, ...file.path.split("/"));
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(output, decodeFile(file), { mode: file.executable ? 0o755 : 0o644 });
	}
	const marker = { kind: record.kind, name: record.name, version: record.version, sha256: record.sha256 };
	writeFileSync(join(stage, EXPORT_MARKER), `${JSON.stringify(marker)}\n`);
}

function checkManagedDestination(destination: string, record: ArtifactRecord): void {
	if (!lstatSync(destination).isDirectory()) throw new Error("Refusing to replace a directory not managed by Beacon");
	const markerPath = join(destination, EXPORT_MARKER);
	if (!existsSync(markerPath)) throw new Error("Refusing to replace a directory not managed by Beacon");
	const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { kind?: string; name?: string };
	if (marker.kind !== record.kind || marker.name !== record.name) throw new Error("Export destination belongs to another artifact");
}

function replaceDestination(destination: string, stage: string, backup: string, record: ArtifactRecord, singleAgent: boolean, force: boolean): void {
	if (existsSync(destination)) {
		if (!force) throw new Error("Export destination already exists; use --force to replace it");
		if (!singleAgent) checkManagedDestination(destination, record);
		renameSync(destination, backup);
	}
	try {
		renameSync(stage, destination);
	} catch (error) {
		if (existsSync(backup)) renameSync(backup, destination);
		throw error;
	}
}

export function exportArtifact(cwd: string, record: ArtifactRecord, destination: string, force: boolean): { path: string } {
	verifyArtifact(record);
	const resolved = resolve(destination);
	guardDestination(resolved, cwd);
	const singleAgent = record.kind === "agent" && resolved.toLowerCase().endsWith(".md");
	const parent = dirname(resolved);
	mkdirSync(parent, { recursive: true });
	const stage = join(parent, `.${basename(resolved)}.lbc-stage-${randomUUID()}`);
	const backup = join(parent, `.${basename(resolved)}.lbc-backup-${randomUUID()}`);
	if (!resolve(stage).startsWith(resolve(parent) + sep) || !resolve(backup).startsWith(resolve(parent) + sep)) {
		throw new Error("Unsafe export staging path");
	}
	try {
		writeStage(stage, record, singleAgent);
		replaceDestination(resolved, stage, backup, record, singleAgent, force);
		if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
		return { path: resolved };
	} finally {
		if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
	}
}
