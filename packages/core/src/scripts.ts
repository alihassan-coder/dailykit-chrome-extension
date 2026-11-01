// Keeps runtime-registered content scripts in line with which tools are on and allowed (bundle builds only).
// Safe to call any number of times: on install, startup, permission changes and settings changes.
import { SCRIPT_PREFIX, scriptId, type RunAt, type World } from './tool.ts';

export interface RegisteredScript {
	id: string;
	matches?: string[];
	js?: string[];
	world?: World;
	runAt?: RunAt;
	persistAcrossSessions?: boolean;
}

/** The slice of `chrome.scripting` this needs, so tests can pass a fake. */
export interface ScriptingApi {
	getRegisteredContentScripts(): Promise<RegisteredScript[]>;
	registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
	unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

export interface RuntimeTool {
	id: string;
	hostMatches: string[];
	contentScripts: { id: string; matches: string[]; world: World; runAt: RunAt; js: string[] }[];
}

const sameScript = (a: RegisteredScript, b: RegisteredScript) =>
	a.world === b.world &&
	a.runAt === b.runAt &&
	JSON.stringify(a.matches) === JSON.stringify(b.matches) &&
	JSON.stringify(a.js) === JSON.stringify(b.js);

export async function syncToolScripts(opts: {
	tools: RuntimeTool[];
	enabled: string[];
	hasAccess: (origins: string[]) => Promise<boolean>;
	scripting: ScriptingApi;
}): Promise<void> {
	const desired: RegisteredScript[] = [];
	for (const tool of opts.tools) {
		if (!opts.enabled.includes(tool.id)) continue;
		if (!(await opts.hasAccess(tool.hostMatches))) continue;
		for (const s of tool.contentScripts) {
			desired.push({
				id: scriptId(tool.id, s.id),
				matches: s.matches,
				js: s.js,
				world: s.world,
				runAt: s.runAt,
				persistAcrossSessions: true
			});
		}
	}

	const current = (await opts.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith(SCRIPT_PREFIX));
	const remove = current.filter((c) => {
		const want = desired.find((d) => d.id === c.id);
		return !want || !sameScript(c, want);
	});
	const kept = new Set(current.filter((c) => !remove.includes(c)).map((c) => c.id));
	const add = desired.filter((d) => !kept.has(d.id));

	if (remove.length) await opts.scripting.unregisterContentScripts({ ids: remove.map((s) => s.id) });
	if (add.length) await opts.scripting.registerContentScripts(add);
}
