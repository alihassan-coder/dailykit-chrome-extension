// The AI providers the agent can use with the user's own keys, through the Vercel AI SDK.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { ApiKeys, ProviderId } from '@toolbelt/core';
import type { LanguageModel } from 'ai';

export interface ModelChoice {
	provider: ProviderId;
	model: string;
}

/** Suggested models, best first. Any other model id can be typed in, for when providers release new ones. */
export const MODELS: Record<ProviderId, { id: string; label: string }[]> = {
	anthropic: [
		{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
		{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
		{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }
	],
	openai: [
		{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
		{ id: 'gpt-6-astra', label: 'GPT-6 Astra' }
	],
	xai: [{ id: 'grok-4.7', label: 'Grok 4.7' }],
	gemini: [
		{ id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
		{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }
	]
};

const ORDER: ProviderId[] = ['anthropic', 'openai', 'xai', 'gemini'];

/** The first model of the first provider the user has a key for. */
export function defaultChoice(keys: ApiKeys): ModelChoice | null {
	const provider = ORDER.find((p) => keys[p]);
	return provider ? { provider, model: MODELS[provider][0]!.id } : null;
}

export function createModel(choice: ModelChoice, keys: ApiKeys): LanguageModel {
	const apiKey = keys[choice.provider];
	if (!apiKey) throw new Error(`Add a ${choice.provider} API key in Toolbelt settings first.`);
	switch (choice.provider) {
		case 'anthropic':
			// Calls go straight from the extension; Anthropic requires this header to accept browser requests.
			return createAnthropic({ apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(
				choice.model
			);
		case 'openai':
			return createOpenAI({ apiKey })(choice.model);
		case 'xai':
			return createXai({ apiKey })(choice.model);
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(choice.model);
	}
}
