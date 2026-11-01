// Everything a tool needs to talk to an AI with the user's own keys: the keys, the live model lists
// (cached for a day, shared by all tools), and the model this tool last used. Each tool remembers its own
// choice, so the agent can stay on a big model while Profile lens uses a quick one.
import { resolveApiKeys, toolValue, type ApiKeys } from '@toolbelt/core';
import { localArea } from '@toolbelt/ui';
import type { LanguageModel } from 'ai';
import { useEffect, useState } from 'react';
import { available, refresh as refreshModels, resolveCache, type ModelCache, type ModelInfo } from './models.ts';
import { createModel, defaultChoice, type ModelChoice } from './providers.ts';

export const keysStore = toolValue(localArea, 'ai', 'keys', resolveApiKeys);
/** Device-only (see syncsKey): every device downloads its own lists. */
export const modelCache = toolValue(localArea, 'ai', 'models', resolveCache);

const asChoice = (v: unknown) =>
	typeof v === 'object' && v !== null && 'provider' in v && 'model' in v ? (v as ModelChoice) : null;

export interface Models {
	/** Null until the saved keys have loaded. */
	keys: ApiKeys | null;
	models: ModelInfo[];
	/** Null when there is no key for any provider. */
	choice: ModelChoice | null;
	choose(choice: ModelChoice): void;
	refresh(): void;
	refreshing: boolean;
	/** Why a refresh failed, in words, or null. */
	note: string | null;
	/** The chosen model, ready for the AI SDK. Throws if there is no key for it. */
	model(): LanguageModel;
}

export function useModels(toolId: string): Models {
	const [choiceStore] = useState(() => toolValue(localArea, toolId, 'model', asChoice));
	const [keys, setKeys] = useState<ApiKeys | null>(null);
	const [cache, setCache] = useState<ModelCache>({});
	const [choice, setChoice] = useState<ModelChoice | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	async function load(k: ApiKeys, force = false) {
		setRefreshing(true);
		const { cache: next, errors } = await refreshModels(await modelCache.get(), k, { force });
		await modelCache.set(next);
		setCache(next);
		setRefreshing(false);
		const failed = Object.entries(errors).map(([p, e]) => `${p}: ${e}`);
		setNote(failed.length ? `Couldn't refresh ${failed.join('; ')}` : null);
		return next;
	}

	useEffect(() => {
		async function start(k: ApiKeys) {
			setKeys(k);
			const saved = await choiceStore.get();
			const pick = (c: ModelCache) =>
				setChoice((current) => {
					const keep = current ?? saved;
					return keep && k[keep.provider] ? keep : defaultChoice(available(c, k));
				});
			const cached = await modelCache.get();
			setCache(cached);
			pick(cached);
			pick(await load(k));
		}
		void keysStore.get().then(start);
		return keysStore.subscribe((k) => void start(k));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		keys,
		models: keys ? available(cache, keys) : [],
		choice,
		choose(c) {
			setChoice(c);
			void choiceStore.set(c);
		},
		refresh: () => keys && void load(keys, true),
		refreshing,
		note,
		model() {
			if (!choice || !keys)
				throw new Error('Connect a Claude subscription or provider API key in the dashboard first.');
			return createModel(choice, keys);
		}
	};
}
