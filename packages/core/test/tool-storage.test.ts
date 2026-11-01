import { describe, expect, it } from 'vitest';
import type { SettingsArea } from '../src/settings.ts';
import { toolValue } from '../src/tool-storage.ts';

function fakeArea() {
	const data: Record<string, unknown> = {};
	const listeners: Parameters<SettingsArea['onChanged']['addListener']>[0][] = [];
	const area: SettingsArea = {
		get: async (key) => ({ [key]: data[key] }),
		set: async (items) => {
			Object.assign(data, items);
			for (const l of listeners)
				l(Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }])), 'local');
		},
		onChanged: {
			addListener: (l) => listeners.push(l),
			removeListener: (l) => listeners.splice(listeners.indexOf(l), 1)
		}
	};
	return { area, data };
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

describe('toolValue', () => {
	it('stores under the tool’s own key and falls back when nothing is saved', async () => {
		const { area, data } = fakeArea();
		const colors = toolValue(area, 'color-picker', 'history', asList);
		expect(await colors.get()).toEqual([]);
		await colors.set(['#2e55e6']);
		expect(data['tb:color-picker:history']).toEqual(['#2e55e6']);
	});

	it('cleans up broken saved data through the resolver', async () => {
		const { area } = fakeArea();
		await area.set({ 'tb:color-picker:history': ['#fff', 3, null] });
		expect(await toolValue(area, 'color-picker', 'history', asList).get()).toEqual(['#fff']);
	});

	it('queues updates and notifies other surfaces', async () => {
		const { area } = fakeArea();
		const a = toolValue(area, 'grayscale', 'sites', asList);
		const b = toolValue(area, 'grayscale', 'sites', asList);
		const seen: string[][] = [];
		b.subscribe((v) => seen.push(v));
		await Promise.all([a.update((v) => [...v, 'a.com']), a.update((v) => [...v, 'b.com'])]);
		expect(await b.get()).toEqual(['a.com', 'b.com']);
		expect(seen.at(-1)).toEqual(['a.com', 'b.com']);
	});
});
