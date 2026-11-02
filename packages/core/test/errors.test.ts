import { describe, expect, it } from 'vitest';
import { AppFailure, appError, describeError, toAppError } from '../src/errors.ts';

const apiError = (statusCode: number, responseBody = '', responseHeaders?: Record<string, string>) =>
	Object.assign(new Error('raw provider text with sk-secret'), {
		name: 'AI_APICallError',
		statusCode,
		responseBody,
		responseHeaders
	});

describe('toAppError', () => {
	it('maps provider status codes to plain errors with a next step', () => {
		expect(toAppError(apiError(401), { provider: 'OpenAI' })).toMatchObject({
			code: 'auth_invalid',
			action: { kind: 'open-ai-settings' }
		});
		expect(toAppError(apiError(404)).code).toBe('model_not_found');
		expect(toAppError(apiError(429, '', { 'retry-after': '7' }))).toMatchObject({
			code: 'rate_limited',
			retryAfterMs: 7000
		});
		expect(toAppError(apiError(429, 'insufficient_quota')).code).toBe('quota_exhausted');
		expect(toAppError(apiError(400, 'prompt is too long: 250000 tokens')).code).toBe('context_too_long');
		expect(toAppError(apiError(529)).code).toBe('provider_unavailable');
	});

	it('looks inside retry wrappers', () => {
		const retry = Object.assign(new Error('Failed after 3 attempts'), {
			name: 'AI_RetryError',
			lastError: apiError(503)
		});
		expect(toAppError(retry).code).toBe('provider_unavailable');
	});

	it('recognises browser failures', () => {
		expect(toAppError(new Error('The extensions gallery cannot be scripted.')).code).toBe('restricted_page');
		expect(
			toAppError(new Error('Cannot access contents of url "https://a.com". Extension manifest must request permission'))
				.code
		).toBe('no_host_access');
		expect(toAppError(new Error('No tab with id: 12.')).code).toBe('tab_gone');
		expect(toAppError(new Error('QUOTA_BYTES quota exceeded')).code).toBe('storage_full');
		expect(toAppError(new TypeError('Failed to fetch')).code).toBe('offline');
		expect(toAppError(Object.assign(new Error('x'), { name: 'AbortError' })).code).toBe('aborted');
	});

	it('never puts the raw message on screen', () => {
		const e = toAppError(apiError(401));
		expect(JSON.stringify(e)).not.toContain('sk-secret');
		expect(toAppError(new Error('weird internal thing')).message).not.toContain('weird');
	});

	it('uses setup-token wording for Claude subscription tokens', () => {
		expect(toAppError(apiError(401), { setupToken: true }).message).toContain('setup-token');
	});

	it('passes AppErrors and AppFailures through', () => {
		const e = appError('linkedin_partial');
		expect(toAppError(e)).toBe(e);
		expect(describeError(new AppFailure(e))).toBe(e);
	});
});
