// Everything a tool needs to talk to an AI with the user's own keys: the keys, the live model lists
// (cached for a day, shared by all tools), and the model this tool last used. Each tool remembers its own
// choice, so the agent can stay on a big model while Profile lens uses a quick one.
import {
	AppFailure,
	appError,
	isClaudeSetupToken,
	resolveApiKeys,
	toolValue,
	type ApiKeys,
	type AppError,
	type ErrorContext
} from '@toolbelt/core';
import { localArea, showError } from '@toolbelt/ui';
import type { LanguageModel } from 'ai';
import { useEffect, useState } from 'react';
import {
	available,
	keyTag,
	refresh as refreshModels,
	resolveCache,
	type ModelCache,
	type ModelInfo
} from './models.ts';
import { createModel, defaultChoice, providerName, type ModelChoice } from './providers.ts';

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
	/** The chosen model's details, when it is in the list. */
	info: ModelInfo | null;
	choose(choice: ModelChoice): void;
	refresh(): void;
	refreshing: boolean;
	/** Why a refresh failed, in words, or null. */
	note: string | null;
	/** The saved model is missing from the provider's live list (model_not_found), or null. */
	problem: AppError | null;
	/** How provider errors for the chosen model should be worded. */
	errorContext: ErrorContext;
	/** The chosen model, ready for the AI SDK. Throws if there is no key for it. */
	model(): LanguageModel;
}

/** The saved choice, checked against a live (not fallback) list for its provider. */
export function choiceProblem(choice: ModelChoice | null, cache: ModelCache, keys: ApiKeys | null): AppError | null {
	if (!choice || !keys) return null;
	const key = keys[choice.provider];
	// A saved Claude subscription token (older versions accepted one): say so up front, before any run fails.
	if (choice.provider === 'anthropic' && key && isClaudeSetupToken(key))
		return appError('subscription_token', { provider: 'Anthropic', setupToken: true });
	const entry = cache[choice.provider];
	if (!key || !entry || entry.key !== keyTag(key) || !entry.models.length) return null;
	if (entry.models.some((m) => m.id === choice.model)) return null;
	return appError(
		'model_not_found',
		{ provider: providerName(choice.provider), model: choice.model },
		{ severity: 'warn' }
	);
}

export function useModels(toolId: string): Models {
	const [choiceStore] = useState(() => toolValue(localArea, toolId, 'model', asChoice));
	const [keys, setKeys] = useState<ApiKeys | null>(null);
	const [cache, setCache] = useState<ModelCache>({});
	const [choice, setChoice] = useState<ModelChoice | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	/** Loads fresh lists. Never throws: a failure keeps the old lists and shows a toast. */
	async function load(k: ApiKeys, force = false): Promise<ModelCache | null> {
		setRefreshing(true);
		try {
			const { cache: next, errors } = await refreshModels(await modelCache.get(), k, { force });
			await modelCache.set(next);
			setCache(next);
			const failed = Object.entries(errors).map(([p, e]) => `${providerName(p)}: ${e}`);
			setNote(failed.length ? `Couldn't refresh ${failed.join('; ')}` : null);
			return next;
		} catch (error) {
			showError(error);
			return null;
		} finally {
			setRefreshing(false);
		}
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
			const fresh = await load(k);
			if (fresh) pick(fresh);
		}
		const run = (k: ApiKeys) => start(k).catch((error: unknown) => void showError(error));
		void keysStore.get().then(run, (error: unknown) => void showError(error));
		return keysStore.subscribe((k) => void run(k));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const models = keys ? available(cache, keys) : [];
	const info = choice ? (models.find((m) => m.provider === choice.provider && m.id === choice.model) ?? null) : null;
	const credential = choice && keys ? keys[choice.provider] : undefined;
	return {
		keys,
		models,
		choice,
		info,
		choose(c) {
			setChoice(c);
			choiceStore.set(c).catch((error: unknown) => void showError(error));
		},
		refresh: () => {
			if (keys) void load(keys, true);
		},
		refreshing,
		note,
		problem: choiceProblem(choice, cache, keys),
		errorContext: choice
			? {
					provider: providerName(choice.provider),
					model: info?.name ?? choice.model,
					setupToken: choice.provider === 'anthropic' && !!credential && isClaudeSetupToken(credential)
				}
			: {},
		model() {
			if (!choice || !keys) throw new AppFailure(appError('no_provider'));
			return createModel(choice, keys);
		}
	};
}
