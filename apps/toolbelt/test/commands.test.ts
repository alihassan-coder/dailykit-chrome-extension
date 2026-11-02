// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Ui from '@toolbelt/ui';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const fakeTools = vi.hoisted(() => [
	{ id: 'agent', name: 'Browser agent', features: [], hostMatches: [], contentScripts: [] },
	{ id: 'color-picker', name: 'Colour picker', features: [], hostMatches: [], contentScripts: [] },
	{ id: 'grayscale', name: 'Black and white', features: [], hostMatches: [], contentScripts: [] }
]);
vi.mock('../shell/tools.ts', () => ({ tools: fakeTools, keywords: {} }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('@toolbelt/ui', async (load) => {
	const ui = await load<typeof Ui>();
	return { ...ui, toast: Object.assign(vi.fn(), { success: toastSuccess }), showError: vi.fn() };
});

const { createSettingsStore, resolveSettings, setToolEnabled } = await import('@toolbelt/core');
const { localArea, showError } = await import('@toolbelt/ui');
const { buildCommands } = await import('../shell/commands.ts');

const store = createSettingsStore(localArea, fakeTools as never);
const settings = () => resolveSettings(undefined, fakeTools as never);

beforeEach(() => {
	fakeBrowser.reset();
	vi.clearAllMocks();
});

const find = (id: string, openTool = vi.fn()) => {
	const command = buildCommands(settings(), store, { openTool, lock: vi.fn() }).find((c) => c.id === id);
	if (!command) throw new Error(`no command ${id}`);
	return { command, openTool };
};

describe('tool actions in the side panel search', () => {
	it('offers each tool’s action under Actions, only while the tool is on', () => {
		const all = buildCommands(settings(), store, { openTool: vi.fn(), lock: vi.fn() });
		const ids = all.filter((c) => c.id.startsWith('do:')).map((c) => c.id);
		expect(ids).toEqual(['do:agent:summarise', 'do:color-picker:pick', 'do:grayscale:toggle-site']);
		expect(all.find((c) => c.id === 'do:agent:summarise')?.group).toBe('Actions');
		const off = setToolEnabled(settings(), 'grayscale', false);
		const without = buildCommands(off, store, { openTool: vi.fn(), lock: vi.fn() });
		expect(without.some((c) => c.id === 'do:grayscale:toggle-site')).toBe(false);
	});

	it('opens the agent and hands it "Summarise this page"', async () => {
		const { command, openTool } = find('do:agent:summarise');
		command.run();
		expect(openTool).toHaveBeenCalledWith('agent');
		await vi.waitFor(async () =>
			expect((await fakeBrowser.storage.session.get('tb:agent:draft'))['tb:agent:draft']).toMatchObject({
				text: 'Summarise this page.',
				send: true
			})
		);
	});

	it('opens the colour picker with a pick request', async () => {
		const { command, openTool } = find('do:color-picker:pick');
		command.run();
		expect(openTool).toHaveBeenCalledWith('color-picker');
		await vi.waitFor(async () =>
			expect(typeof (await fakeBrowser.storage.session.get('tb:color-picker:pick'))['tb:color-picker:pick']).toBe(
				'number'
			)
		);
	});

	it('toggles black and white for the site in the active tab, and says so', async () => {
		vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ url: 'https://news.example.com/' }] as never);
		find('do:grayscale:toggle-site').command.run();
		await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Black and white is on · news.example.com'));
		expect((await fakeBrowser.storage.local.get('tb:grayscale:state'))['tb:grayscale:state']).toMatchObject({
			on: true
		});
	});

	it('explains browser pages instead of doing nothing', async () => {
		vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ url: 'chrome://settings' }] as never);
		find('do:grayscale:toggle-site').command.run();
		await vi.waitFor(() => expect(showError).toHaveBeenCalled());
		expect(toastSuccess).not.toHaveBeenCalled();
	});
});
