import { describe, expect, it } from 'vitest';
import {
	DEFAULT_THEME,
	createSettingsStore,
	featureOn,
	moveTool,
	orderedTools,
	resolveSettings,
	setFeature,
	setToolEnabled,
	type SettingsArea,
	type ToolInfo
} from '../src/settings.ts';

const tools: ToolInfo[] = [
	{
		id: 'cairn',
		features: [
			{ id: 'quote', defaultOn: true },
			{ id: 'sync', defaultOn: false }
		]
	},
	{ id: 'notes', features: [] },
	{ id: 'agent', features: [] }
];

describe('resolveSettings', () => {
	it('turns every tool on with its default features on a fresh install', () => {
		const s = resolveSettings(undefined, tools);
		expect(s.tools.cairn).toEqual({ enabled: true, features: { quote: true, sync: false } });
		expect(s.order).toEqual(['cairn', 'notes', 'agent']);
		expect(s.theme).toEqual(DEFAULT_THEME);
	});

	it('keeps saved choices and fills in tools and features added later', () => {
		const saved = {
			version: 1,
			tools: { cairn: { enabled: false, features: { quote: false } } },
			order: ['notes', 'cairn'],
			theme: { ...DEFAULT_THEME, accent: 'moss' }
		};
		const s = resolveSettings(saved, tools);
		expect(s.tools.cairn).toEqual({ enabled: false, features: { quote: false, sync: false } });
		expect(s.tools.agent?.enabled).toBe(true);
		expect(s.order).toEqual(['notes', 'cairn', 'agent']);
		expect(s.theme.accent).toBe('moss');
	});

	it('drops tools that no longer exist and ignores broken values', () => {
		const saved = {
			version: 1,
			tools: { gone: { enabled: true, features: {} } },
			order: ['gone', 42],
			theme: { accent: 7 }
		};
		const s = resolveSettings(saved, tools);
		expect(s.tools).not.toHaveProperty('gone');
		expect(s.order).toEqual(['cairn', 'notes', 'agent']);
		expect(s.theme).toEqual(DEFAULT_THEME);
	});
});

describe('changes', () => {
	const base = resolveSettings(undefined, tools);

	it('switches a tool and a single feature without touching the rest', () => {
		const off = setToolEnabled(base, 'notes', false);
		expect(off.tools.notes?.enabled).toBe(false);
		expect(off.tools.cairn).toEqual(base.tools.cairn);
		const f = setFeature(base, 'cairn', 'sync', true);
		expect(featureOn(f, 'cairn', 'sync')).toBe(true);
		expect(featureOn(f, 'cairn', 'quote')).toBe(true);
	});

	it('a feature of a switched-off tool counts as off', () => {
		expect(featureOn(setToolEnabled(base, 'cairn', false), 'cairn', 'quote')).toBe(false);
	});

	it('moves a tool to a new position, clamped to the list', () => {
		expect(moveTool(base, 'agent', 0).order).toEqual(['agent', 'cairn', 'notes']);
		expect(moveTool(base, 'cairn', 99).order).toEqual(['notes', 'agent', 'cairn']);
		expect(moveTool(base, 'missing', 0).order).toEqual(base.order);
	});

	it('lists tools in the saved order', () => {
		expect(orderedTools(moveTool(base, 'agent', 0), tools).map((t) => t.id)).toEqual(['agent', 'cairn', 'notes']);
	});
});

function fakeArea() {
	const data: Record<string, unknown> = {};
	const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
	const area: SettingsArea = {
		get: async (key) => ({ [key]: data[key] }),
		set: async (items) => {
			Object.assign(data, items);
			const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]));
			for (const l of listeners) l(changes, 'local');
		},
		onChanged: {
			addListener: (l) => listeners.push(l),
			removeListener: (l) => listeners.splice(listeners.indexOf(l), 1)
		}
	};
	return { area, data };
}

describe('createSettingsStore', () => {
	it('saves updates and tells subscribers, including other surfaces', async () => {
		const { area, data } = fakeArea();
		const panel = createSettingsStore(area, tools);
		const dashboard = createSettingsStore(area, tools);
		const seen: boolean[] = [];
		const stop = panel.subscribe((s) => seen.push(s.tools.notes!.enabled));

		await dashboard.update((s) => setToolEnabled(s, 'notes', false));

		expect((await panel.get()).tools.notes?.enabled).toBe(false);
		expect(seen).toEqual([false]);
		expect(data['tb:settings']).toMatchObject({ version: 1 });
		stop();
	});

	it('runs updates one after another so quick clicks are not lost', async () => {
		const { area } = fakeArea();
		const store = createSettingsStore(area, tools);
		await Promise.all([
			store.update((s) => setToolEnabled(s, 'notes', false)),
			store.update((s) => setToolEnabled(s, 'agent', false))
		]);
		const s = await store.get();
		expect([s.tools.notes?.enabled, s.tools.agent?.enabled]).toEqual([false, false]);
	});
});
