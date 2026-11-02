// What Profile lens keeps: your question sets, and every analysis. Each person is one storage key
// (tb:profile-lens:saved:<slug>) holding their latest snapshot plus one analysis (and chat) per question set,
// so analysing someone with another set never overwrites the first one, and one person's record syncs on its
// own. A small index lists every analysis for the history screen. Old records (one analysis per person)
// are read as-is and rewritten in the new shape on their next save. Everything syncs encrypted, like all tb: keys.
import { toAppError, toolValue, type SettingsArea } from '@toolbelt/core';
import type { ChatMessage } from './analyze.ts';
import { resolveSets, type Analysis, type QuestionSet } from './fields.ts';
import type { ProfileSnapshot } from './profile.ts';

/** One analysis, as the screens use it. */
export interface SavedAnalysis {
	profile: ProfileSnapshot;
	/** The set as it was when analysed, so old answers still make sense after you edit the set. */
	set: QuestionSet;
	analysis: Analysis;
	chat: ChatMessage[];
	analyzedAt: number;
}

type SetAnalysis = Omit<SavedAnalysis, 'profile'>;

/** What one storage key holds: the person, and their analyses by set id. */
export interface PersonRecord {
	profile: ProfileSnapshot;
	analyses: Record<string, SetAnalysis>;
}

export interface IndexEntry {
	slug: string;
	/** Empty for entries saved before analyses were kept per set. */
	setId: string;
	name: string;
	headline: string;
	photo: string | null;
	setName: string;
	score: number;
	verdict: Analysis['icp']['verdict'];
	analyzedAt: number;
	/** Approximate size of the person's record, for keeping storage under its limit. */
	bytes?: number;
}

/** At most this many people are kept... */
export const MAX_SAVED = 300;
/** ...and their records together stay under this (chrome.storage.local allows 10 MB in all). */
export const MAX_BYTES = 6_000_000;
/** A snapshot this recent is reused for another analysis instead of reading LinkedIn again. */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const entryKey = (e: { slug: string; setId: string }) => `${e.slug}|${e.setId}`;

const asIndex = (v: unknown): IndexEntry[] =>
	Array.isArray(v)
		? v
				.filter((e): e is IndexEntry => typeof e?.slug === 'string' && typeof e?.name === 'string')
				.map((e) => ({ ...e, setId: typeof e.setId === 'string' ? e.setId : '' }))
		: [];

/** Reads both shapes: the current one, and the old single analysis per person. */
export function asPerson(v: unknown): PersonRecord | null {
	if (typeof v !== 'object' || v === null || !('profile' in v)) return null;
	const r = v as Partial<PersonRecord> & Partial<SavedAnalysis>;
	if (!r.profile) return null;
	if (r.analyses && typeof r.analyses === 'object') return { profile: r.profile, analyses: r.analyses };
	if (r.analysis && r.set) {
		const { set, analysis, chat, analyzedAt } = r as SavedAnalysis;
		return { profile: r.profile, analyses: { [set.id]: { set, analysis, chat: chat ?? [], analyzedAt } } };
	}
	return null;
}

const sizeOf = (v: unknown) => JSON.stringify(v ?? null).length;
const newest = (p: PersonRecord) => Object.values(p.analyses).sort((a, b) => b.analyzedAt - a.analyzedAt)[0] ?? null;

export function profileLensStore(area: SettingsArea, limits: { maxBytes?: number; maxSaved?: number } = {}) {
	const maxBytes = limits.maxBytes ?? MAX_BYTES;
	const maxSaved = limits.maxSaved ?? MAX_SAVED;
	const sets = toolValue(area, 'profile-lens', 'sets', resolveSets);
	const activeSet = toolValue(area, 'profile-lens', 'active-set', (v) => (typeof v === 'string' ? v : null));
	const index = toolValue(area, 'profile-lens', 'index', asIndex);
	const person = (slug: string) => toolValue(area, 'profile-lens', `saved:${slug}`, asPerson);
	const keyOf = (slug: string) => `tb:profile-lens:saved:${slug}`;

	const entriesFor = (p: PersonRecord): IndexEntry[] => {
		const bytes = sizeOf(p);
		return Object.entries(p.analyses).map(([setId, a]) => ({
			slug: p.profile.slug,
			setId,
			name: p.profile.name,
			headline: a.analysis.facts.headline,
			photo: p.profile.photo,
			setName: a.set.name,
			score: a.analysis.icp.score,
			verdict: a.analysis.icp.verdict,
			analyzedAt: a.analyzedAt,
			bytes
		}));
	};

	/** Puts the person's entries into the index (replacing their old ones), newest first. */
	const reindex = (slug: string, p: PersonRecord | null) =>
		index.update((list) =>
			[...(p ? entriesFor(p) : []), ...list.filter((e) => e.slug !== slug)].sort((a, b) => b.analyzedAt - a.analyzedAt)
		);

	/** Forgets the least recently analysed people beyond the size and count limits. Never `keep`. */
	async function evict(list: IndexEntry[], keep: string, budget: number) {
		const people = new Map<string, number>();
		for (const e of list) if (!people.has(e.slug)) people.set(e.slug, e.bytes ?? 0); // list is newest first
		let total = 0;
		let count = 0;
		const dropped: string[] = [];
		for (const [slug, bytes] of people) {
			total += bytes;
			count++;
			if (slug !== keep && (total > budget || count > maxSaved)) dropped.push(slug);
		}
		if (!dropped.length) return;
		await area.set(Object.fromEntries(dropped.map((s) => [keyOf(s), null])));
		await index.update((l) => l.filter((e) => !dropped.includes(e.slug)));
	}

	async function load(slug: string, setId?: string | null): Promise<SavedAnalysis | null> {
		const p = await person(slug).get();
		if (!p) return null;
		const a = (setId && p.analyses[setId]) || (setId ? null : newest(p));
		return a ? { profile: p.profile, ...a } : null;
	}

	return {
		sets,
		activeSet,
		index,
		/** The analysis for this set, or (without a set) the newest one. */
		load,
		/** The analysis for this set, or the person's newest one if this set hasn't been used on them. */
		async loadBest(slug: string, setId: string): Promise<SavedAnalysis | null> {
			return (await load(slug, setId)) ?? (await load(slug));
		},
		/** The last snapshot read for this person, if any. */
		async snapshot(slug: string): Promise<ProfileSnapshot | null> {
			return (await person(slug).get())?.profile ?? null;
		},

		async save(record: SavedAnalysis) {
			const { profile, set, analysis, chat, analyzedAt } = record;
			const write = async () => {
				const p = await person(profile.slug).update((old) => ({
					profile,
					analyses: { ...old?.analyses, [set.id]: { set, analysis, chat, analyzedAt } }
				}));
				return reindex(profile.slug, p);
			};
			for (;;) {
				try {
					await evict(await write(), profile.slug, maxBytes);
					return;
				} catch (e) {
					// Out of room (other tools share the space): forget the least recent person, then try again.
					if (toAppError(e).code !== 'storage_full') throw e;
					const oldest = (await index.get()).filter((x) => x.slug !== profile.slug).at(-1);
					if (!oldest) throw e;
					await area.set({ [keyOf(oldest.slug)]: null });
					await index.update((l) => l.filter((x) => x.slug !== oldest.slug));
				}
			}
		},

		async saveChat(slug: string, setId: string, chat: ChatMessage[]) {
			await person(slug).update((p) => {
				const a = p?.analyses[setId];
				return p && a ? { ...p, analyses: { ...p.analyses, [setId]: { ...a, chat } } } : p;
			});
		},

		/** Removes one analysis (the person goes when it was their last), or the whole person without a set. */
		async remove(slug: string, setId?: string) {
			const current = await person(slug).get();
			const rest = { ...current?.analyses };
			if (setId) delete rest[setId];
			const left = setId && current && Object.keys(rest).length ? { profile: current.profile, analyses: rest } : null;
			await area.set({ [keyOf(slug)]: left });
			await reindex(slug, left);
		}
	};
}

export type ProfileLensStore = ReturnType<typeof profileLensStore>;
