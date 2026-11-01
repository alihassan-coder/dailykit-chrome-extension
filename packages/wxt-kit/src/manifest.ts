// Pure manifest transforms, kept out of the WXT hooks so they can be unit tested.
import type { ToolDescriptor } from '@toolbelt/core';

export type BuildMode = 'bundle' | 'standalone';

/** The manifest fields these transforms read and write. */
export interface ManifestSlice {
	permissions?: string[];
	host_permissions?: string[];
	optional_host_permissions?: string[];
	content_scripts?: { js?: string[]; matches?: string[] }[];
}

/** Entrypoint name WXT builds a tool script under: content-scripts/<name>.js */
export const entryName = (toolId: string, scriptId: string) => `${toolId}-${scriptId}`;
export const scriptFile = (toolId: string, scriptId: string) => `content-scripts/${entryName(toolId, scriptId)}.js`;

const unique = <T>(xs: T[]) => [...new Set(xs)];

/**
 * Bundle: tool sites become optional (asked for when a tool is switched on, never an install-time or
 * update-time escalation) and tool content scripts leave the manifest (the background registers them).
 * Standalone: the manifest WXT generated already lists them statically; only tool permissions are added.
 */
export function applyTools<M extends ManifestSlice>(manifest: M, tools: ToolDescriptor[], mode: BuildMode): M & ManifestSlice {
	const out: M & ManifestSlice = { ...manifest };
	const toolPerms = tools.flatMap((t) => t.permissions);

	if (mode === 'standalone') {
		out.permissions = unique([...(manifest.permissions ?? []), ...toolPerms]);
		return out;
	}

	const ours = new Set(tools.flatMap((t) => t.contentScripts.map((s) => scriptFile(t.id, s.id))));
	const scripts = (manifest.content_scripts ?? []).filter((cs) => !cs.js?.some((f) => ours.has(f)));
	if (scripts.length) out.content_scripts = scripts;
	else delete out.content_scripts;

	const toolHosts = unique(tools.flatMap((t) => t.hostMatches));
	const hosts = (manifest.host_permissions ?? []).filter((h) => !toolHosts.includes(h));
	if (hosts.length) out.host_permissions = hosts;
	else delete out.host_permissions;

	out.optional_host_permissions = unique([...(manifest.optional_host_permissions ?? []), ...toolHosts]);
	out.permissions = unique([...(manifest.permissions ?? []), 'scripting', ...toolPerms]);
	return out;
}

/** What the background gets at runtime: descriptors without build-only fields, plus built script paths. */
export function runtimeRegistry(tools: ToolDescriptor[], mode: BuildMode) {
	return {
		mode,
		tools: tools.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			hostMatches: t.hostMatches,
			features: t.features,
			contentScripts: t.contentScripts.map((s) => ({
				id: s.id,
				matches: s.matches,
				world: s.world,
				runAt: s.runAt,
				js: [scriptFile(t.id, s.id)]
			}))
		}))
	};
}
