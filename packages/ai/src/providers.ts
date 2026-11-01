// The AI providers tools can use with the user's own keys, through the Vercel AI SDK. Which models
// each offers is fetched live (models.ts), not hard-coded here.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { ApiKeys, ProviderId } from '@toolbelt/core';
import type { LanguageModel } from 'ai';
import type { ModelInfo } from './models.ts';

export interface ModelChoice {
	provider: ProviderId;
	model: string;
}

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
