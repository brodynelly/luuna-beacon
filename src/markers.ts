import { upgradeLegacyMarkers } from "./legacy-layout.ts";

export const START_MARKER = "<!-- luuna-beacon:start -->";
export const END_MARKER = "<!-- luuna-beacon:end -->";

export const ONBOARD_VERSION = 3;
export const VERSION_MARKER = `<!-- luuna-beacon-onboard-v:${String(ONBOARD_VERSION)} -->`;

export function hasMarkerSection(rawContent: string): boolean {
	const content = upgradeLegacyMarkers(rawContent);
	return content.includes(START_MARKER) && content.includes(END_MARKER);
}

export function detectStatus(rawContent: string): "missing" | "current" | "outdated" {
	const content = upgradeLegacyMarkers(rawContent);
	if (!hasMarkerSection(content)) return "missing";
	if (content.includes(VERSION_MARKER)) return "current";
	return "outdated";
}

export function replaceMarkerSection(rawContent: string, newSection: string): string | null {
	const content = upgradeLegacyMarkers(rawContent);
	const startIdx = content.indexOf(START_MARKER);
	const endIdx = content.indexOf(END_MARKER);
	if (startIdx === -1 || endIdx === -1) return null;
	const before = content.slice(0, startIdx);
	const after = content.slice(endIdx + END_MARKER.length);
	return before + wrapInMarkers(newSection) + after;
}

export function wrapInMarkers(section: string): string {
	return `${START_MARKER}\n${section}\n${END_MARKER}`;
}
