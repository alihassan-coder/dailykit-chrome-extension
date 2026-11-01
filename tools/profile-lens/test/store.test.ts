import type { SettingsArea } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETS, type Analysis } from '../src/fields.ts';
import type { ProfileSnapshot } from '../src/profile.ts';
import { MAX_SAVED, profileLensStore, type SavedAnalysis } from '../src/store.ts';

function fakeArea() {
	const data: Record<string, unknown> = {};
	const area: SettingsArea = {
		get: async (key) => ({ [key]: data[key] }),
		set: async (items) => void Object.assign(data, items),
		onChanged: { addListener: () => {}, removeListener: () => {} }
	};
	return { area, data };
}

const record = (slug: string, at: number): SavedAnalysis => ({
	profile: { slug, name: slug, photo: null } as ProfileSnapshot,
	set: DEFAULT_SETS[0]!,
	analysis: { facts: { headline: `${slug} headline` }, icp: { score: 70, verdict: 'possible' } } as Analysis,
	chat: [],
	analyzedAt: at
});

describe('profileLensStore', () => {
	it('saves each profile under its own key and lists the newest first', async () => {
		const { area, data } = fakeArea();
		const store = profileLensStore(area);
		await store.save(record('ann', 1));
		await store.save(record('bob', 2));
		await store.save(record('ann', 3));
		expect((await store.index.get()).map((e) => [e.slug, e.analyzedAt])).toEqual([
			['ann', 3],
			['bob', 2]
		]);
		expect(data['tb:profile-lens:saved:bob']).toMatchObject({ analyzedAt: 2 });
		expect((await store.load('ann'))?.analyzedAt).toBe(3);
	});

	it('keeps chats with their profile, and removes a profile completely', async () => {
		const { area } = fakeArea();
		const store = profileLensStore(area);
		await store.save(record('ann', 1));
		await store.saveChat('ann', [{ role: 'user', text: 'Hi' }]);
		expect((await store.load('ann'))?.chat).toHaveLength(1);
		await store.remove('ann');
		expect(await store.load('ann')).toBeNull();
		expect(await store.index.get()).toEqual([]);
	});

	it('forgets the oldest analyses past the limit', async () => {
		const { area, data } = fakeArea();
		const store = profileLensStore(area);
		for (let i = 0; i <= MAX_SAVED; i++) await store.save(record(`p${i}`, i));
		expect(await store.index.get()).toHaveLength(MAX_SAVED);
		expect(data['tb:profile-lens:saved:p0']).toBeNull();
	});
});
