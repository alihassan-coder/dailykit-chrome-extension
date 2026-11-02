// The AI providers tools can use with the user's own keys, through the Vercel AI SDK. Which models
// each offers is fetched live (models.ts), not hard-coded here.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import {
	CLAUDE_CODE_SYSTEM,
	anthropicHeaders,
	isClaudeSetupToken,
	type ApiKeys,
	type ProviderId
} from '@toolbelt/core';
import { wrapLanguageModel, type LanguageModel } from 'ai';
import type { ModelInfo } from './models.ts';

export interface ModelChoice {
	provider: ProviderId;
	model: string;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	xai: 'xAI',
	gemini: 'Google'
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
		case 'anthropic': {
			const subscription = isClaudeSetupToken(apiKey);
			const headers = anthropicHeaders(apiKey);
			const model = createAnthropic({
				...(subscription ? { authToken: apiKey } : { apiKey }),
				headers,
				// AI SDK supplies its own per-call User-Agent, overriding provider headers. Apply the
				// subscription protocol version at the final transport boundary; keep SDK beta headers.
				...(subscription
					? {
							fetch: (input: RequestInfo | URL, init?: RequestInit) => {
								const finalHeaders = new Headers(init?.headers);
								finalHeaders.set('user-agent', headers['user-agent']!);
								return fetch(input, { ...init, headers: finalHeaders });
							}
						}
					: {})
			})(choice.model);
			if (!subscription) return model;
			// The subscription protocol requires this first system block. Preserve the tool's instructions
			// and all messages/tool calls after it, for both streaming and non-streaming requests.
			return wrapLanguageModel({
				model,
				middleware: {
					specificationVersion: 'v4',
					transformParams: async ({ params }) => ({
						...params,
						prompt: [{ role: 'system', content: CLAUDE_CODE_SYSTEM }, ...params.prompt]
					})
				}
			});
		}
		case 'openai':
			return createOpenAI({ apiKey })(choice.model);
		case 'xai':
			return createXai({ apiKey })(choice.model);
		case 'gemini':
			return createGoogleGenerativeAI({ apiKey })(choice.model);
	}
}
