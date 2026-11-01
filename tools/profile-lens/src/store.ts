// What Profile lens keeps: your question sets, and every analysis. Each analysis is its own storage key
// (tb:profile-lens:saved:<slug>), so one person's record syncs on its own and a long history never becomes
// one huge value; a small index lists them for the history screen. Everything syncs encrypted, like all tb: keys.
import { toolValue, type SettingsArea } from '@toolbelt/core';
import { resolveSets, type Analysis, type QuestionSet } from './fields.ts';
import type { ChatMessage } from './analyze.ts';
import type { ProfileSnapshot } from './profile.ts';

export interface SavedAnalysis {
	profile: ProfileSnapshot;
	/** The set as it was when analyzed, so old answers still make sense after you edit the set. */
	set: QuestionSet;
	analysis: Analysis;
	chat: ChatMessage[];
	analyzedAt: number;
}

export interface IndexEntry {
	slug: string;
	name: string;
	headline: string;
	photo: string | null;
	setName: string;
	score: number;
	verdict: Analysis['icp']['verdict'];
	analyzedAt: number;
}

/** Oldest analyses beyond this are forgotten, so storage stays small. */
export const MAX_SAVED = 300;

const asIndex = (v: unknown): IndexEntry[] =>
	Array.isArray(v) ? v.filter((e): e is IndexEntry => typeof e?.slug === 'string' && typeof e?.name === 'string') : [];
const asSaved = (v: unknown): SavedAnalysis | null =>
	typeof v === 'object' && v !== null && 'profile' in v && 'analysis' in v ? (v as SavedAnalysis) : null;

export function profileLensStore(area: SettingsArea) {
	const sets = toolValue(area, 'profile-lens', 'sets', resolveSets);
	const activeSet = toolValue(area, 'profile-lens', 'active-set', (v) => (typeof v === 'string' ? v : null));
	const index = toolValue(area, 'profile-lens', 'index', asIndex);
	const saved = (slug: string) => toolValue(area, 'profile-lens', `saved:${slug}`, asSaved);

	return {
		sets,
		activeSet,
		index,
		load: (slug: string) => saved(slug).get(),

		async save(record: SavedAnalysis) {
			const { profile, analysis } = record;
			await saved(profile.slug).set(record);
			const entry: IndexEntry = {
				slug: profile.slug,
				name: profile.name,
				headline: analysis.facts.headline,
				photo: profile.photo,
				setName: record.set.name,
				score: analysis.icp.score,
				verdict: analysis.icp.verdict,
				analyzedAt: record.analyzedAt
			};
			const next = await index.update((list) => [entry, ...list.filter((e) => e.slug !== profile.slug)]);
			// Forget the oldest beyond the limit: their records go too.
			const dropped = next.slice(MAX_SAVED);
			if (dropped.length) {
				await index.set(next.slice(0, MAX_SAVED));
				await area.set(Object.fromEntries(dropped.map((e) => [`tb:profile-lens:saved:${e.slug}`, null])));
			}
		},

		async saveChat(slug: string, chat: ChatMessage[]) {
			await saved(slug).update((r) => (r ? { ...r, chat } : r));
		},

		async remove(slug: string) {
			await area.set({ [`tb:profile-lens:saved:${slug}`]: null });
			await index.update((list) => list.filter((e) => e.slug !== slug));
		}
	};
}

export type ProfileLensStore = ReturnType<typeof profileLensStore>;
