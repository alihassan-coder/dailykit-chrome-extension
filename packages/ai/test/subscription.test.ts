import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAUDE_CODE_SYSTEM } from '@toolbelt/core';
import { generateText, streamText } from 'ai';
import { createModel } from '../src/providers.ts';
import { testClaudeConnection } from '../src/connection.ts';

const token = `sk-ant-oat01-${'a'.repeat(90)}`;
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

describe('Claude subscription transport', () => {
	it('sends bearer auth and compatibility headers, preserves tool instructions and tool calls', async () => {
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
		vi.stubGlobal('fetch', fetchFn);
		await generateText({
			model: createModel({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropic: token }),
			instructions: 'You are the Toolbelt browser agent.',
			messages: [
				{ role: 'user', content: 'Find the title.' },
				{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'read_page', input: {} }] },
				{
					role: 'tool',
					content: [
						{ type: 'tool-result', toolCallId: 't1', toolName: 'read_page', output: { type: 'text', value: 'Title' } }
					]
				}
			],
			maxRetries: 0
		});
		const init = fetchFn.mock.calls[0]![1]!;
		const headers = new Headers(init.headers);
		expect(headers.get('authorization')).toBe(`Bearer ${token}`);
		expect(headers.has('x-api-key')).toBe(false);
		expect(headers.get('anthropic-beta')).toContain('oauth-2025-04-20');
		expect(headers.get('x-app')).toBe('cli');
		expect(headers.get('user-agent')).toContain('claude-cli/2.1.280');
		const body = JSON.parse(String(init.body));
		expect(body.system.map((s: { text: string }) => s.text)).toEqual([
			CLAUDE_CODE_SYSTEM,
			'You are the Toolbelt browser agent.'
		]);
		expect(body.messages[1].content[0]).toMatchObject({ type: 'tool_use', id: 't1', name: 'read_page' });
		expect(body.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: 'Title' });
	});

	it('preserves API-key authentication without subscription identity', async () => {
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
		vi.stubGlobal('fetch', fetchFn);
		await generateText({
			model: createModel({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropic: 'sk-ant-api03-test' }),
			prompt: 'Hi'
		});
		const init = fetchFn.mock.calls[0]![1]!;
		expect(new Headers(init.headers).get('x-api-key')).toBe('sk-ant-api03-test');
		expect(new Headers(init.headers).has('authorization')).toBe(false);
		expect(JSON.parse(String(init.body)).system ?? []).toEqual([]);
	});

	it('applies subscription auth and identity to streaming calls too', async () => {
		const events = [
			['message_start', { type: 'message_start', message: { ...response, content: [] } }],
			['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
			['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }],
			['content_block_stop', { type: 'content_block_stop', index: 0 }],
			[
				'message_delta',
				{ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }
			],
			['message_stop', { type: 'message_stop' }]
		];
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), {
				headers: { 'content-type': 'text/event-stream' }
			})
		);
		vi.stubGlobal('fetch', fetchFn);
		const result = streamText({
			model: createModel({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropic: token }),
			prompt: 'Hi',
			maxRetries: 0
		});
		expect(await result.text).toBe('OK');
		const init = fetchFn.mock.calls[0]![1]!;
		expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`);
		expect(JSON.parse(String(init.body)).system[0].text).toBe(CLAUDE_CODE_SYSTEM);
	});

	it('tests inference even when a setup token cannot list models', async () => {
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({}, { status: 403 }))
			.mockResolvedValueOnce(Response.json(response));
		vi.stubGlobal('fetch', fetchFn);
		expect(await testClaudeConnection(token)).toContain('responded using your Claude setup token');
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('explains revoked tokens without disclosing provider response details', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(Response.json({}, { status: 403 }))
				.mockResolvedValueOnce(
					Response.json(
						{ type: 'error', error: { type: 'authentication_error', message: `secret ${token}` } },
						{ status: 401 }
					)
				)
		);
		await expect(testClaudeConnection(token)).rejects.toThrow('Run claude setup-token again');
	});
});
