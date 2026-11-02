// The AI providers tools can use with the user's own keys, through the Vercel AI SDK. Which models
// each offers is fetched live (models.ts), not hard-coded here.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import {
	AppFailure,
	anthropicHeaders,
	appError,
	isClaudeSetupToken,
	type ApiKeys,
	type ProviderId
} from '@toolbelt/core';
import type { LanguageModel } from 'ai';
import type { ModelInfo } from './models.ts';

export interface ModelChoice {
	provider: ProviderId;
	model: string;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	xai: 'xAI',
	gemini: 'Google',
	groq: 'Groq'
};

/** "Anthropic", "Google": how a provider is named on screen and in error messages. */
export const providerName = (id: ProviderId | string) => PROVIDER_NAMES[id as ProviderId] ?? id;

/** Claude Opus 5.5 when Anthropic is available, otherwise the first live model. */
export function defaultChoice(models: ModelInfo[]): ModelChoice | null {
	const preferred = models.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-5-5') ?? models[0];
	return preferred ? { provider: preferred.provider, model: preferred.id } : null;
}

export function createModel(choice: ModelChoice, keys: ApiKeys): LanguageModel {
	const apiKey = keys[choice.provider];
	if (!apiKey) throw new Error(`Add a ${choice.provider} API key in Toolbelt settings first.`);
	switch (choice.provider) {
		case 'anthropic':
			// A Claude subscription token only works in Anthropic's own apps; never send it, say what to do instead.
			if (isClaudeSetupToken(apiKey))
				throw new AppFailure(appError('subscription_token', { provider: 'Anthropic', setupToken: true }));
			return createAnthropic({ apiKey, headers: anthropicHeaders() })(choice.model);
		case 'openai':
			return createOpenAI({ apiKey })(choice.model);
		case 'xai':
			return createXai({ apiKey })(choice.model);
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(choice.model);
		case 'groq':
			// Groq allows browser CORS with a Bearer key; no extra header is needed.
			return createGroq({ apiKey })(choice.model);
	}
}
