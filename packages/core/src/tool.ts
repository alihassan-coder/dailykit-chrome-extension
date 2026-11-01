// The tool contract. Every tool package exports one ToolDescriptor: plain data, no browser APIs,
// because the build (wxt-kit) imports it in Node to generate entrypoints and manifests.

export type World = 'MAIN' | 'ISOLATED';
export type RunAt = 'document_start' | 'document_end' | 'document_idle';

export interface ContentScriptSpec {
	/** Unique within the tool. Registered at runtime as `tb:<toolId>:<id>`. */
	id: string;
	/** Absolute path to a WXT content-script entry file inside the tool package. */
	entry: string;
	matches: string[];
	world: World;
	runAt: RunAt;
}

export interface FeatureSpec {
	/** Stable key, used in settings storage. Never rename once shipped. */
	id: string;
	title: string;
	description: string;
	defaultOn: boolean;
}

export interface ToolDescriptor {
	/** Lowercase, kebab-case, stable forever (storage keys and script ids derive from it). */
	id: string;
	name: string;
	description: string;
	/** Sites the tool runs on. Optional permissions in the bundle, required in a standalone build. */
	hostMatches: string[];
	/** Extra extension permissions beyond what the shell always has. */
	permissions: string[];
	contentScripts: ContentScriptSpec[];
	features: FeatureSpec[];
}

const KEBAB_ID = /^[a-z][a-z0-9-]*$/;

/** Identity function with validation, so a broken descriptor fails the build, not the browser. */
export function defineTool(tool: ToolDescriptor): ToolDescriptor {
	if (!KEBAB_ID.test(tool.id)) throw new Error(`Tool id "${tool.id}" must be lowercase kebab-case`);
	const seen = new Set<string>();
	for (const s of tool.contentScripts) {
		if (!KEBAB_ID.test(s.id)) throw new Error(`${tool.id}: content script id "${s.id}" must be lowercase kebab-case`);
		if (seen.has(s.id)) throw new Error(`${tool.id}: duplicate content script id "${s.id}"`);
		seen.add(s.id);
		for (const m of s.matches) {
			if (!tool.hostMatches.includes(m)) throw new Error(`${tool.id}/${s.id}: match "${m}" is not in hostMatches`);
		}
	}
	const features = new Set<string>();
	for (const f of tool.features) {
		if (features.has(f.id)) throw new Error(`${tool.id}: duplicate feature id "${f.id}"`);
		features.add(f.id);
	}
	return tool;
}

/** Runtime id for a registered content script. The prefix lets the shell touch only its own registrations. */
export const scriptId = (toolId: string, localId: string) => `tb:${toolId}:${localId}`;
export const SCRIPT_PREFIX = 'tb:';
