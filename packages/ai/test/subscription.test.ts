// Claude subscription tokens (from `claude setup-token`) only work in Anthropic's own apps. Toolbelt must refuse
// them clearly, never send them, and never present itself as Claude Code. API keys keep working.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFailure } from '@toolbelt/core';
import { generateText } from 'ai';
import { createModel } from '../src/providers.ts';
import { testClaudeConnection } from '../src/connection.ts';
import { fetchModels } from '../src/models.ts';
import { choiceProblem } from '../src/useModels.ts';

const token = `sk-ant-oat01-${'a'.repeat(90)}`;
const apiKey = `sk-ant-api03-${'b'.repeat(90)}`;
const response = {
	id: 'msg_test',
	type: 'message',
	role: 'assistant',
	model: 'claude-haiku-5-5',
	content: [{ type: 'text', text: 'OK' }],
	stop_reason: 'end_turn',
	stop_sequence: null,
	usage: { input_tokens: 10, output_tokens: 1 }
};
afterEach(() => vi.unstubAllGlobals());

const code = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		return e instanceof AppFailure ? e.app.code : 'other';
	}
	return 'none';
};

describe('Claude subscription tokens', () => {
	it('are refused when a model is created, with a clear next step', () => {
		expect(code(() => createModel({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropic: token }))).toBe(
			'subscription_token'
		);
	});

	it('are refused by the connection test without any request', async () => {
		const fetchFn = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchFn);
		await expect(testClaudeConnection(token)).rejects.toMatchObject({ app: { code: 'subscription_token' } });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('are refused when listing models, without any request', async () => {
		const fetchFn = vi.fn<typeof fetch>();
		await expect(fetchModels('anthropic', token, fetchFn)).rejects.toThrow(/Anthropic API key/);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('show up front as the chosen model’s problem', () => {
		expect(choiceProblem({ provider: 'anthropic', model: 'claude-haiku-5-5' }, {}, { anthropic: token })?.code).toBe(
			'subscription_token'
		);
	});
});

describe('Anthropic API keys', () => {
	it('use x-api-key and the browser header, with no Claude Code identity', async () => {
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
		vi.stubGlobal('fetch', fetchFn);
		await generateText({
			model: createModel({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropic: apiKey }),
			instructions: 'You are the Toolbelt browser agent.',
			prompt: 'Hi',
			maxRetries: 0
		});
		const init = fetchFn.mock.calls[0]![1]!;
		const headers = new Headers(init.headers);
		expect(headers.get('x-api-key')).toBe(apiKey);
		expect(headers.get('authorization')).toBeNull();
		expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
		expect(headers.get('x-app')).toBeNull();
		expect(headers.get('anthropic-beta') ?? '').not.toContain('claude-code');
		expect(String(init.body)).not.toContain('Claude Code');
	});
});
