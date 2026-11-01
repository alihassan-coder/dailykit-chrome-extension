import { describe, expect, it } from 'vitest';
import { PROVIDERS, looksLikeKey, maskKey, resolveApiKeys } from '../src/ai-keys.ts';

describe('AI provider keys', () => {
	it('supports Anthropic, OpenAI, xAI Grok and Google Gemini', () => {
		expect(PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'openai', 'xai', 'gemini']);
	});

	it('keeps known providers with real values only', () => {
		expect(resolveApiKeys({ openai: ' sk-abc ', anthropic: '', other: 'x', xai: 5 })).toEqual({ openai: 'sk-abc' });
		expect(resolveApiKeys(null)).toEqual({});
	});

	it('masks a key so it can be recognised but not read', () => {
		expect(maskKey('sk-ant-api03-abcdefghijklmnop-wxyz')).toBe('sk-ant-…wxyz');
		expect(maskKey('short')).toBe('•••••');
	});

	it('warns on keys that do not look like the provider’s', () => {
		expect(looksLikeKey('anthropic', 'sk-ant-api03-0123456789abcdef')).toBe(true);
		expect(looksLikeKey('anthropic', 'sk-proj-0123456789abcdef')).toBe(false);
		expect(looksLikeKey('gemini', 'AIzaSyA-0123456789abcdef')).toBe(true);
	});
});
