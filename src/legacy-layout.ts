// One-time migration from the pre-Luuna project layout. This is the only
// module that may name the legacy directory.
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LEGACY_DIR = ".canopy";
const LUUNA_DIR = ".luuna";
const BEACON_DIR = "beacon";

function isSymlink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

function rewriteIfPresent(file: string): void {
	if (!existsSync(file)) return;
	const text = readFileSync(file, "utf8");
	const next = text.split(`${LEGACY_DIR}/`).join(`${LUUNA_DIR}/${BEACON_DIR}/`);
	if (next !== text) writeFileSync(file, next);
}

/**
 * Move a legacy project data directory to `.luuna/beacon/` when the new one is
 * absent. Prints one notice line to stderr (stdout carries JSON). Returns true
 * when a move happened. Throws on ambiguous or unsafe layouts.
 */
export function migrateLegacyLayout(cwd: string): boolean {
	const legacy = join(cwd, LEGACY_DIR);
	const luuna = join(cwd, LUUNA_DIR);
	const target = join(luuna, BEACON_DIR);
	if (!existsSync(legacy) && !isSymlink(legacy)) return false;
	if (existsSync(target)) {
		throw new Error(
			`Both ${LEGACY_DIR}/ and ${LUUNA_DIR}/${BEACON_DIR}/ exist. Merge or remove ${LEGACY_DIR}/ and retry.`,
		);
	}
	if (isSymlink(legacy)) {
		throw new Error(`Refusing to migrate: ${LEGACY_DIR} is a symlink. Move it to ${LUUNA_DIR}/${BEACON_DIR}/ manually.`);
	}
	if (isSymlink(luuna)) {
		throw new Error(`Refusing to migrate: ${LUUNA_DIR} is a symlink.`);
	}
	mkdirSync(luuna, { recursive: true });
	renameSync(legacy, target);
	rewriteIfPresent(join(cwd, ".gitattributes"));
	rewriteIfPresent(join(cwd, ".gitignore"));
	process.stderr.write(`Migrated ${LEGACY_DIR}/ to ${LUUNA_DIR}/${BEACON_DIR}/\n`);
	return true;
}

const LEGACY_MARKER_PAIRS: ReadonlyArray<readonly [string, string]> = [
	["<!-- canopy:start -->", "<!-- luuna-beacon:start -->"],
	["<!-- canopy:end -->", "<!-- luuna-beacon:end -->"],
];

/** Rewrite legacy onboard section markers in an instructions file to the current ones. */
export function upgradeLegacyMarkers(content: string): string {
	let out = content;
	for (const [from, to] of LEGACY_MARKER_PAIRS) out = out.split(from).join(to);
	return out;
}
