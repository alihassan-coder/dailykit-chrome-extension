import { isClaudeSetupToken } from '@toolbelt/core';
import { APICallError, generateText } from 'ai';
import { FALLBACK, fetchModels } from './models.ts';
import { createModel } from './providers.ts';

/** An explicit, small inference probe: listing models alone doesn't prove inference access. */
export async function testClaudeConnection(credential: string): Promise<string> {
	const subscription = isClaudeSetupToken(credential);
	try {
		// Setup tokens can have inference permission without model-list permission.
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
		return `Connected: ${model.name} responded using ${subscription ? 'your Claude setup token' : 'your API key'}.`;
	} catch (error) {
		// Never return raw provider responses: they may contain credentials or request bodies.
		/* eslint-disable preserve-caught-error -- Provider error causes can expose the secret request headers. */
		if (APICallError.isInstance(error)) {
			if (error.statusCode === 401 || error.statusCode === 403) {
				throw new Error(
					subscription
						? 'Claude rejected this setup token. Run claude setup-token again and replace it. Your account may not allow this connection.'
						: 'Claude rejected this API key. Check the key and its permissions.'
				);
			}
			if (error.statusCode === 429) throw new Error('Claude usage limit reached. Try again when your limit resets.');
			throw new Error(
				`Claude could not complete the test (status ${error.statusCode ?? 'unknown'}). Check model access and account usage.`
			);
		}
		throw new Error('Could not get a Claude response. Check your connection and try again.');
		/* eslint-enable preserve-caught-error */
	}
}
