import { describe, expect, it } from 'vitest';
import { reconcileScripts, type RegisteredScript, type ScriptingApi } from '../src/scripts.ts';

const tools = [
	{
		id: 'cairn',
		hostMatches: ['https://claude.ai/*'],
		contentScripts: [
			{ id: 'claude-main', matches: ['https://claude.ai/*'], world: 'MAIN' as const, runAt: 'document_start' as const, js: ['content-scripts/cairn-claude-main.js'] },
			{ id: 'claude-ui', matches: ['https://claude.ai/*'], world: 'ISOLATED' as const, runAt: 'document_idle' as const, js: ['content-scripts/cairn-claude-ui.js'] }
		]
	},
	{
		id: 'notes',
		hostMatches: ['https://example.com/*'],
		contentScripts: [
			{ id: 'page', matches: ['https://example.com/*'], world: 'ISOLATED' as const, runAt: 'document_idle' as const, js: ['content-scripts/notes-page.js'] }
		]
	}
];

function fakeScripting(initial: RegisteredScript[] = []) {
	let registered = [...initial];
	const api: ScriptingApi = {
		getRegisteredContentScripts: async () => registered,
		registerContentScripts: async (s) => {
			for (const x of s) if (registered.some((r) => r.id === x.id)) throw new Error(`duplicate ${x.id}`);
			registered.push(...s);
		},
		unregisterContentScripts: async (f) => {
			if (!f?.ids) throw new Error('unfiltered unregister would remove scripts we do not own');
			registered = registered.filter((r) => !f.ids!.includes(r.id));
		}
	};
	return { api, ids: () => registered.map((r) => r.id).sort() };
}

const allowAll = async () => true;

describe('reconcileScripts', () => {
	it('registers every script of an enabled, permitted tool', async () => {
		const s = fakeScripting();
		await reconcileScripts({ tools, enabled: ['cairn'], hasAccess: allowAll, scripting: s.api });
		expect(s.ids()).toEqual(['tb:cairn:claude-main', 'tb:cairn:claude-ui']);
	});

	it('keeps the page-world script in the MAIN world at document_start', async () => {
		const s = fakeScripting();
		await reconcileScripts({ tools, enabled: ['cairn'], hasAccess: allowAll, scripting: s.api });
		const main = (await s.api.getRegisteredContentScripts()).find((r) => r.id === 'tb:cairn:claude-main');
		expect(main).toMatchObject({ world: 'MAIN', runAt: 'document_start', persistAcrossSessions: true });
	});

	it('skips a tool whose site access was not granted', async () => {
		const s = fakeScripting();
		await reconcileScripts({ tools, enabled: ['cairn', 'notes'], hasAccess: async (m) => !m.includes('https://claude.ai/*'), scripting: s.api });
		expect(s.ids()).toEqual(['tb:notes:page']);
	});

	it('removes scripts of a tool that was switched off', async () => {
		const s = fakeScripting();
		await reconcileScripts({ tools, enabled: ['cairn', 'notes'], hasAccess: allowAll, scripting: s.api });
		await reconcileScripts({ tools, enabled: ['notes'], hasAccess: allowAll, scripting: s.api });
		expect(s.ids()).toEqual(['tb:notes:page']);
	});

	it('never touches scripts it does not own (e.g. WXT dev reload scripts)', async () => {
		const foreign = { id: 'wxt:reload', matches: ['<all_urls>'], js: ['x.js'] };
		const s = fakeScripting([foreign]);
		await reconcileScripts({ tools, enabled: [], hasAccess: allowAll, scripting: s.api });
		expect(s.ids()).toEqual(['wxt:reload']);
	});

	it('is idempotent and re-registers a script whose definition changed', async () => {
		const stale = { id: 'tb:cairn:claude-ui', matches: ['https://claude.ai/*'], js: ['old.js'], world: 'ISOLATED' as const, runAt: 'document_idle' as const };
		const s = fakeScripting([stale]);
		await reconcileScripts({ tools, enabled: ['cairn'], hasAccess: allowAll, scripting: s.api });
		await reconcileScripts({ tools, enabled: ['cairn'], hasAccess: allowAll, scripting: s.api });
		const ui = (await s.api.getRegisteredContentScripts()).find((r) => r.id === 'tb:cairn:claude-ui');
		expect(ui?.js).toEqual(['content-scripts/cairn-claude-ui.js']);
		expect(s.ids()).toEqual(['tb:cairn:claude-main', 'tb:cairn:claude-ui']);
	});
});
