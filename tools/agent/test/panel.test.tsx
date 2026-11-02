// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { RunOptions } from '../src/loop.ts';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));

// The panel's page connection and loop are replaced, so these tests drive the screen, not a model.
const fake = vi.hoisted(() => ({
	tab: { id: 7, windowId: 1, url: 'https://example.com/', title: 'Example' } as {
		id: number;
		windowId: number;
		url: string;
		title: string;
	} | null,
	access: true,
	run: null as null | ((opts: RunOptions) => Promise<unknown>)
}));
vi.mock('../src/page-api.ts', () => ({
	activeTab: async () => fake.tab,
	hasHostAccess: async () => fake.access,
	requestHostAccess: async () => true,
	pageApi: () => ({})
}));
vi.mock('../src/loop.ts', () => ({
	runAgent: (opts: RunOptions) => fake.run!(opts)
}));

const { AppFailure, appError, createSettingsStore } = await import('@toolbelt/core');
const { SettingsProvider, localArea } = await import('@toolbelt/ui');
const { default: AgentPanel, recallNotes, rememberChat, RECALL_WAIT_MS } = await import('../src/panel.tsx');

const tools = [{ id: 'agent', features: [{ id: 'screenshots', defaultOn: true }] }];
const renderPanel = () =>
	render(
		<SettingsProvider store={createSettingsStore(localArea, tools)}>
			<AgentPanel />
		</SettingsProvider>
	);

const models = () =>
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: false })
				)
		)
	);

async function connected() {
	models();
	await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } });
	renderPanel();
	return screen.findByRole('textbox', { name: 'Ask the agent' });
}

async function ask(text: string) {
	const box = await connected();
	fireEvent.change(box, { target: { value: text } });
	fireEvent.keyDown(box, { key: 'Enter' });
	return box;
}

beforeEach(() => {
	fakeBrowser.reset();
	fake.tab = { id: 7, windowId: 1, url: 'https://example.com/', title: 'Example' };
	fake.access = true;
	fake.run = async () => [];
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Browser agent panel', () => {
	it('asks for an API key before anything else', async () => {
		renderPanel();
		expect(await screen.findByText('Connect an AI provider')).toBeTruthy();
	});

	it('offers the models of the providers you have keys for, inside the composer', async () => {
		await connected();
		expect(await screen.findByRole('button', { name: 'Model: Claude Opus 5.5. Change model' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
	});

	it('fills the composer from an example prompt', async () => {
		const box = (await connected()) as HTMLTextAreaElement;
		fireEvent.click(screen.getByRole('button', { name: 'Summarise this page' }));
		expect(box.value).toBe('Summarise this page');
	});

	it('shows the answer as formatted text, and the steps as compact rows', async () => {
		fake.run = async ({ onEvent }) => {
			onEvent({ type: 'step', id: 's1', tool: 'read_page', summary: 'Read the page', status: 'done', ms: 120 });
			onEvent({ type: 'finished', answer: 'The page is about **cats**.' });
			return [];
		};
		await ask('What is this?');
		expect(await screen.findByText('cats')).toBeTruthy();
		expect(screen.getByText('cats').tagName).toBe('STRONG');
		expect(screen.getByText('Read the page')).toBeTruthy();
		expect(screen.getByText('What is this?')).toBeTruthy();
	});

	it('folds long runs of steps into one row', async () => {
		fake.run = async ({ onEvent }) => {
			for (let i = 0; i < 8; i++)
				onEvent({ type: 'step', id: `s${i}`, tool: 'find', summary: `Step ${i}`, status: 'done' });
			onEvent({ type: 'finished', answer: 'Done.' });
			return [];
		};
		await ask('Go');
		expect(await screen.findByText('6 steps')).toBeTruthy();
		expect(screen.getByText('Step 7')).toBeTruthy();
	});

	it('says there is no page when no tab is active, instead of doing nothing', async () => {
		fake.tab = null;
		await ask('Summarise');
		expect(await screen.findByText('No page to work with')).toBeTruthy();
	});

	it('asks for site access when Toolbelt cannot read the tab', async () => {
		fake.tab = { id: 7, windowId: 1, url: '', title: '' };
		await ask('Summarise');
		expect(await screen.findByText('Toolbelt can’t read this site yet')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Allow on this site' })).toBeTruthy();
	});

	it('explains browser pages', async () => {
		fake.tab = { id: 7, windowId: 1, url: 'chrome://settings', title: 'Settings' };
		await ask('Summarise');
		expect(await screen.findByText('This page can’t be read')).toBeTruthy();
	});

	it('shows provider failures as a clear notice with the fix, never the raw message', async () => {
		fake.run = async () => {
			throw new AppFailure(appError('auth_invalid', { provider: 'Anthropic' }));
		};
		await ask('Summarise');
		expect(await screen.findByText('Anthropic rejected the key')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open AI settings' })).toBeTruthy();
	});

	it('retries the last task from the notice', async () => {
		let calls = 0;
		fake.run = async ({ task, onEvent }) => {
			calls++;
			if (calls === 1) throw new AppFailure(appError('rate_limited'));
			onEvent({ type: 'finished', answer: `Answered ${task}` });
			return [];
		};
		await ask('Summarise');
		fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
		expect(await screen.findByText('Answered Summarise')).toBeTruthy();
		expect(screen.queryByText('Rate limit reached')).toBeNull();
		expect(screen.getAllByText('Summarise')).toHaveLength(1);
	});

	it('approves with Enter and denies with Escape on the approval card', async () => {
		const answers: string[] = [];
		fake.run = async ({ approve, onEvent }) => {
			const request = {
				summary: 'Click button “Go”',
				site: 'example.com',
				url: 'https://example.com/',
				targetText: 'Go now',
				warnings: [],
				alwaysAsk: false,
				highlighted: true
			};
			answers.push(await approve(request));
			answers.push(await approve(request));
			onEvent({ type: 'finished', answer: 'Done.' });
			return [];
		};
		await ask('Click go');
		const card = await screen.findByRole('alertdialog', { name: 'Approve this action' });
		expect(document.activeElement).toBe(card);
		expect(screen.getByText('“Go now”')).toBeTruthy();
		fireEvent.keyDown(card, { key: 'Enter' });
		fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
		await screen.findByText('Done.');
		expect(answers).toEqual(['once', 'decline']);
	});

	it('shows a working indicator with Stop while it runs', async () => {
		let release = () => {};
		fake.run = ({ onEvent, signal }) =>
			new Promise((resolve, reject) => {
				onEvent({ type: 'progress', step: 3 });
				release = () => resolve([]);
				signal?.addEventListener('abort', () => reject(new AppFailure(appError('aborted'))));
			});
		await ask('Long task');
		expect(await screen.findByText('Working… step 3')).toBeTruthy();
		fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]!);
		expect(await screen.findByText('Stopped.')).toBeTruthy();
		await act(async () => release());
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

	it('tells the panel when memory is off because Toolbelt is locked', async () => {
		const send = answer(async () => ({ ok: false, status: { state: 'locked' }, error: 'locked' }));
		const onStatus = vi.fn();
		expect(await recallNotes('dinner', onStatus)).toEqual([]);
		expect(onStatus).toHaveBeenCalledWith({ state: 'locked' });
		send.mockRestore();
	});

	it('shows "Memory off · locked" during a run on a locked account', async () => {
		const send = answer(async () => ({ ok: false, status: { state: 'locked' }, error: 'locked' }));
		fake.run = async ({ recall, onEvent }) => {
			await recall?.('x');
			onEvent({ type: 'finished', answer: 'Ok.' });
			return [];
		};
		await ask('Hi');
		await waitFor(() => expect(screen.getByText(/Memory off · locked/)).toBeTruthy());
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
