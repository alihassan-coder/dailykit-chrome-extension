import { AppFailure, appError, isClaudeSetupToken, toAppError } from '@toolbelt/core';
import { APICallError, generateText } from 'ai';
import { FALLBACK, fetchModels } from './models.ts';
import { createModel } from './providers.ts';

/** An explicit, small inference probe: listing models alone doesn't prove inference access. */
export async function testClaudeConnection(credential: string): Promise<string> {
	// Refused before any request: subscription tokens only work in Anthropic's own apps.
	if (isClaudeSetupToken(credential))
		throw new AppFailure(appError('subscription_token', { provider: 'Anthropic', setupToken: true }));
	try {
		const models = await fetchModels('anthropic', credential).catch(() => FALLBACK.anthropic ?? []);
		const model = models.find((m) => m.id.includes('haiku')) ?? models[0];
		if (!model) throw new Error('No Claude models available.');
		const result = await generateText({
			model: createModel({ provider: 'anthropic', model: model.id }, { anthropic: credential }),
			prompt: 'Reply with OK.',
			maxOutputTokens: 16,
			maxRetries: 0,
			abortSignal: AbortSignal.timeout(20_000)
		});
		if (!result.text.trim()) throw new Error('No text returned.');
		return `Connected: ${model.name} responded using your API key.`;
	} catch (error) {
		// Never return raw provider responses: they may contain credentials or request bodies.
		/* eslint-disable preserve-caught-error -- Provider error causes can expose the secret request headers. */
		if (APICallError.isInstance(error)) {
			throw new AppFailure(toAppError(error, { provider: 'Anthropic' }));
		}
		throw new Error('Could not get a Claude response. Check your connection and try again.');
		/* eslint-enable preserve-caught-error */
	}
}
