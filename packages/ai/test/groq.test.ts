// Groq runs open models (Llama, Qwen, GPT-OSS, Kimi) through the official @ai-sdk/groq provider.
import { describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { createModel, providerName } from '../src/providers.ts';

const completion = {
	id: 'chatcmpl-test',
	object: 'chat.completion',
	created: 0,
	model: 'llama-3.3-70b-versatile',
	choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
	usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
};

describe('Groq', () => {
	it('is named Groq on screen and in errors', () => {
		expect(providerName('groq')).toBe('Groq');
	});

	it('needs a key', () => {
		expect(() => createModel({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, {})).toThrow(/API key/);
	});

	it('calls Groq chat completions with the Bearer key', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(completion)));
		vi.stubGlobal('fetch', fetchFn);
		try {
			const model = createModel({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, { groq: 'gsk_test' });
			const { text } = await generateText({ model, prompt: 'Hi' });
			expect(text).toBe('OK');
			const [url, init] = fetchFn.mock.calls[0]!;
			expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
			expect(new Headers(init!.headers).get('authorization')).toBe('Bearer gsk_test');
			expect(JSON.parse(String(init!.body)).model).toBe('llama-3.3-70b-versatile');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
