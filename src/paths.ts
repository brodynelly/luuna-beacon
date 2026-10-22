import { join } from "node:path";
import { migrateLegacyLayout } from "./legacy-layout.ts";

/** Project-relative data directory, POSIX separators (for git pathspecs and messages). */
export const BEACON_REL = ".luuna/beacon";

/** Absolute data directory. Migrates a legacy layout first when needed. */
export function beaconDir(cwd: string): string {
	migrateLegacyLayout(cwd);
	return join(cwd, ".luuna", "beacon");
}

export function promptsFile(cwd: string): string {
	return join(beaconDir(cwd), "prompts.jsonl");
}

export function schemasFile(cwd: string): string {
	return join(beaconDir(cwd), "schemas.jsonl");
}

export function configFile(cwd: string): string {
	return join(beaconDir(cwd), "config.yaml");
}
