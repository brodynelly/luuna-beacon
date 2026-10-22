import { resolvePrompt } from "./render.ts";
import type { Prompt, Schema } from "./types.ts";

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

export interface ValidationError {
	section: string;
	rule: string;
	message: string;
}

export function validatePrompt(
	prompt: Prompt,
	schema: Schema,
	allPrompts: Prompt[],
): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: string[] = [];

	// Resolve full section list (including inherited sections)
	let sections = prompt.sections;
	try {
		const rendered = resolvePrompt(prompt.name, allPrompts);
		sections = rendered.sections;
	} catch {
		// If render fails, validate with own sections only
	}

	const sectionMap = new Map(sections.map((s) => [s.name, s]));

	// Check required sections
	for (const required of schema.requiredSections) {
		if (!sectionMap.has(required)) {
			errors.push({
				section: required,
				rule: "required",
				message: `Required section "${required}" is missing`,
			});
		}
	}

	// Run regex rules
	if (schema.rules) {
		for (const rule of schema.rules) {
			const section = sectionMap.get(rule.section);
			if (!section) {
				// Section doesn't exist — skip regex check (required check handles missing)
				continue;
			}

			try {
				const regex = new RegExp(rule.pattern);
				if (!regex.test(section.body)) {
					errors.push({
						section: rule.section,
						rule: rule.pattern,
						message: rule.message,
					});
				}
			} catch {
				warnings.push(
					`Invalid regex pattern in rule for section "${rule.section}": ${rule.pattern}`,
				);
			}
		}
	}

	// Atlas block / extends_atlas shape validation runs regardless of schema rules.
	errors.push(...validateAtlas(prompt));

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

const VALID_ATLAS_KEYS = new Set(["prime", "budget", "on_empty"]);
const VALID_PRIME_KEYS = new Set(["domains", "files"]);
const VALID_ON_EMPTY = new Set(["skip", "warn", "error"]);

/**
 * Validate the shape of a prompt's `atlas` block and `extends_atlas` flag.
 * Returns structural errors (unknown keys, wrong types, bad enum values).
 * Does not check semantics like "domains exist in .luuna/atlas/config.yaml" —
 * that lives in the optional doctor check (upstream tracker).
 */
export function validateAtlas(prompt: Prompt): ValidationError[] {
	const errors: ValidationError[] = [];

	const extendsAtlas = (prompt as { extends_atlas?: unknown }).extends_atlas;
	if (extendsAtlas !== undefined && typeof extendsAtlas !== "boolean") {
		errors.push({
			section: "extends_atlas",
			rule: "type",
			message: `extends_atlas must be a boolean (got ${describeValue(extendsAtlas)})`,
		});
	}

	const atlas = (prompt as { atlas?: unknown }).atlas;
	if (atlas === undefined) return errors;

	if (!isPlainObject(atlas)) {
		errors.push({
			section: "atlas",
			rule: "type",
			message: `atlas must be an object (got ${describeValue(atlas)})`,
		});
		return errors;
	}

	for (const key of Object.keys(atlas)) {
		if (!VALID_ATLAS_KEYS.has(key)) {
			errors.push({
				section: "atlas",
				rule: "unknown-key",
				message: `Unknown key "${key}" in atlas block (allowed: prime, budget, on_empty)`,
			});
		}
	}

	if (atlas.budget !== undefined) {
		const b = atlas.budget;
		if (typeof b !== "number" || !Number.isFinite(b) || b < 0) {
			errors.push({
				section: "atlas.budget",
				rule: "type",
				message: `atlas.budget must be a non-negative finite number (got ${describeValue(b)})`,
			});
		}
	}

	if (atlas.on_empty !== undefined) {
		const v = atlas.on_empty;
		if (typeof v !== "string" || !VALID_ON_EMPTY.has(v)) {
			errors.push({
				section: "atlas.on_empty",
				rule: "enum",
				message: `atlas.on_empty must be one of "skip", "warn", "error" (got ${describeValue(v)})`,
			});
		}
	}

	if (atlas.prime !== undefined) {
		const prime = atlas.prime;
		if (!isPlainObject(prime)) {
			errors.push({
				section: "atlas.prime",
				rule: "type",
				message: `atlas.prime must be an object (got ${describeValue(prime)})`,
			});
		} else {
			for (const key of Object.keys(prime)) {
				if (!VALID_PRIME_KEYS.has(key)) {
					errors.push({
						section: "atlas.prime",
						rule: "unknown-key",
						message: `Unknown key "${key}" in atlas.prime (allowed: domains, files)`,
					});
				}
			}
			if (prime.domains !== undefined && !isStringArray(prime.domains)) {
				errors.push({
					section: "atlas.prime.domains",
					rule: "type",
					message: `atlas.prime.domains must be an array of strings (got ${describeValue(prime.domains)})`,
				});
			}
			if (prime.files !== undefined && !isStringArray(prime.files)) {
				errors.push({
					section: "atlas.prime.files",
					rule: "type",
					message: `atlas.prime.files must be an array of strings (got ${describeValue(prime.files)})`,
				});
			}
		}
	}

	return errors;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function describeValue(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return "array";
	if (typeof v === "string") return `string "${v}"`;
	return typeof v;
}
