// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { createSettingsStore } = await import('@toolbelt/core');
const { SettingsProvider, localArea } = await import('@toolbelt/ui');
const { default: AgentPanel, recallNotes, rememberChat, RECALL_WAIT_MS } = await import('../src/panel.tsx');

const tools = [{ id: 'agent', features: [{ id: 'screenshots', defaultOn: true }] }];
const renderPanel = () =>
	render(
		<SettingsProvider store={createSettingsStore(localArea, tools)}>
			<AgentPanel />
		</SettingsProvider>
	);

beforeEach(() => fakeBrowser.reset());
afterEach(cleanup);

describe('Browser agent panel', () => {
	it('asks for an API key before anything else', async () => {
		renderPanel();
		expect(await screen.findByText('Add an AI provider key')).toBeTruthy();
	});

	it('offers the models of the providers you have keys for', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: false })
					)
			)
		);
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } });
		renderPanel();
		expect(await screen.findByRole('button', { name: 'Model: Claude Opus 5.5. Change model' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Ask the agent' })).toBeTruthy();
	});
});

describe('memory from the panel', () => {
	// The background answers memory messages; fake its replies.
	const answer = (reply: (message: { type: string }) => Promise<unknown>) =>
		vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(reply as never);

	it('asks the background for notes and hands it finished chats', async () => {
		const send = answer(async (m) =>
			m.type === 'memory:recall'
				? { ok: true, status: { state: 'ready' }, items: [{ id: '1', text: 'Vegetarian', createdAt: 0 }] }
				: { ok: true, status: { state: 'ready' } }
		);
		expect(await recallNotes('dinner')).toEqual(['Vegetarian']);
		rememberChat([{ role: 'user', content: 'Book dinner' }]);
		expect(send.mock.calls.map((c) => c[0])).toEqual([
			{ type: 'memory:recall', query: 'dinner', limit: 8 },
			{ type: 'memory:add', messages: [{ role: 'user', content: 'Book dinner' }] }
		]);
		send.mockRestore();
	});

	it('starts without notes when memory is off, missing or slow', async () => {
		let send = answer(async () => ({ ok: false, status: { state: 'no-embedding-key' }, error: 'x' }));
		expect(await recallNotes('dinner')).toEqual([]);
		send.mockRestore();
		send = answer(async () => {
			throw new Error('Could not establish connection');
		});
		expect(await recallNotes('dinner')).toEqual([]);
		send.mockRestore();
		vi.useFakeTimers();
		send = answer(() => new Promise(() => {}));
		const pending = recallNotes('dinner');
		await vi.advanceTimersByTimeAsync(RECALL_WAIT_MS);
		expect(await pending).toEqual([]);
		vi.useRealTimers();
		send.mockRestore();
	});
});
