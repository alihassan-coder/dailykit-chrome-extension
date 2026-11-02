import type { SettingsArea } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETS, type Analysis } from '../src/fields.ts';
import type { ProfileSnapshot } from '../src/profile.ts';
import { MAX_SAVED, profileLensStore, type SavedAnalysis } from '../src/store.ts';

function fakeArea(quotaBytes = Infinity) {
	const data: Record<string, unknown> = {};
	const area: SettingsArea = {
		get: async (key) => ({ [key]: data[key] }),
		set: async (items) => {
			const next = { ...data, ...items };
			if (JSON.stringify(next).length > quotaBytes) throw new Error('QUOTA_BYTES quota exceeded');
			Object.assign(data, items);
		},
		onChanged: { addListener: () => {}, removeListener: () => {} }
	};
	return { area, data };
}

const [sales, hiring] = DEFAULT_SETS as [(typeof DEFAULT_SETS)[0], (typeof DEFAULT_SETS)[0]];

const record = (slug: string, at: number, set = sales, padding = ''): SavedAnalysis => ({
	profile: { slug, name: slug, photo: null, intro: padding } as ProfileSnapshot,
	set,
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
		expect(data['tb:profile-lens:saved:bob']).toMatchObject({ analyses: { [sales.id]: { analyzedAt: 2 } } });
		expect((await store.load('ann', sales.id))?.analyzedAt).toBe(3);
	});

	it('keeps one analysis (and chat) per question set, so another set never overwrites the first', async () => {
		const { area } = fakeArea();
		const store = profileLensStore(area);
		await store.save(record('ann', 1, sales));
		await store.saveChat('ann', sales.id, [{ role: 'user', text: 'Hi' }]);
		await store.save(record('ann', 2, hiring));
		expect((await store.load('ann', sales.id))?.chat).toHaveLength(1);
		expect((await store.load('ann', hiring.id))?.set.name).toBe(hiring.name);
		// Without a set (or with one not used on them yet), the newest analysis.
		expect((await store.load('ann'))?.analyzedAt).toBe(2);
		expect((await store.loadBest('ann', 'other'))?.analyzedAt).toBe(2);
		expect((await store.index.get()).map((e) => [e.slug, e.setId])).toEqual([
			['ann', hiring.id],
			['ann', sales.id]
		]);

		await store.remove('ann', hiring.id);
		expect(await store.load('ann', hiring.id)).toBeNull();
		expect((await store.load('ann', sales.id))?.chat).toHaveLength(1);
		await store.remove('ann', sales.id);
		expect(await store.load('ann')).toBeNull();
		expect(await store.index.get()).toEqual([]);
	});

	it('reads records saved before analyses were kept per set', async () => {
		const { area, data } = fakeArea();
		const old = record('ann', 5, { ...sales, id: 'old-set' });
		data['tb:profile-lens:saved:ann'] = old;
		data['tb:profile-lens:index'] = [
			{
				slug: 'ann',
				name: 'ann',
				headline: '',
				photo: null,
				setName: 'Sales lead',
				score: 70,
				verdict: 'possible',
				analyzedAt: 5
			}
		];
		const store = profileLensStore(area);
		expect(await store.load('ann')).toEqual(old);
		expect((await store.index.get())[0]?.setId).toBe('');
		// A new analysis with another set keeps the old one.
		await store.save(record('ann', 6, hiring));
		expect((await store.load('ann', 'old-set'))?.analyzedAt).toBe(5);
		expect((await store.index.get()).map((e) => e.setId)).toEqual([hiring.id, 'old-set']);
	});

	it('forgets the oldest people past the count limit', async () => {
		const { area, data } = fakeArea();
		const store = profileLensStore(area);
		for (let i = 0; i <= MAX_SAVED; i++) await store.save(record(`p${i}`, i));
		expect(await store.index.get()).toHaveLength(MAX_SAVED);
		expect(data['tb:profile-lens:saved:p0']).toBeNull();
	});

	it('forgets the oldest people when their records grow past the size budget', async () => {
		const { area, data } = fakeArea();
		const store = profileLensStore(area, { maxBytes: 5_000 });
		const tiny = { id: 't', name: 'T', icp: '', fields: [] };
		for (let i = 0; i < 5; i++) await store.save(record(`p${i}`, i, tiny, 'x'.repeat(1_200)));
		const kept = (await store.index.get()).map((e) => e.slug);
		expect(kept).toEqual(['p4', 'p3', 'p2']);
		expect(data['tb:profile-lens:saved:p0']).toBeNull();
		expect(data['tb:profile-lens:saved:p1']).toBeNull();
	});

	it('makes room and retries when storage is full, and reports storage_full when it still is', async () => {
		const { area } = fakeArea(9_000);
		const store = profileLensStore(area, { maxBytes: 100_000 });
		const big = 'x'.repeat(2_500);
		for (let i = 0; i < 6; i++) await store.save(record(`p${i}`, i, sales, big));
		expect((await store.index.get())[0]?.slug).toBe('p5');

		await expect(store.save(record('huge', 9, sales, 'x'.repeat(20_000)))).rejects.toThrow(/quota/i);
	});
});
