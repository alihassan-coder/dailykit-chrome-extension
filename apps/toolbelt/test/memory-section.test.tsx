// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MemoryRequest, MemoryResponse, MemoryStatus } from '@toolbelt/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { MemorySection } = await import('../entrypoints/options/MemorySection.tsx');

const ready: MemoryStatus = {
	state: 'ready',
	enabled: true,
	embedder: 'openai/text-embedding-3-small@512',
	extractor: 'openai/gpt-5-mini',
	count: 2,
	otherModel: 0,
	lastError: null
};
const items = [
	{ id: 'a', text: 'Is vegetarian', createdAt: Date.now() },
	{ id: 'b', text: 'Lives in Lahore', createdAt: Date.now() }
];

/** Fakes the background's answers and records what the screen asked. */
function background(answer: (req: MemoryRequest) => MemoryResponse) {
	const asked: MemoryRequest[] = [];
	vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async (req: MemoryRequest) => {
		asked.push(req);
		return answer(req);
	}) as never);
	return asked;
}

beforeEach(() => fakeBrowser.reset());
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Memory section', () => {
	it('says which key to add when there is no embedding key, and links to AI providers', async () => {
		background(() => ({ ok: false, status: { state: 'no-embedding-key' }, error: 'x' }));
		render(<MemorySection />);
		expect(await screen.findByText('Add an OpenAI or Gemini key to turn memory on')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Add a key in AI providers' }));
		expect(location.hash).toBe('#ai');
	});

	it('lists memories, deletes one, and switches memory off', async () => {
		const asked = background((req) =>
			req.type === 'memory:list' ? { ok: true, status: ready, items } : { ok: true, status: ready }
		);
		render(<MemorySection />);
		expect(await screen.findByText('Is vegetarian')).toBeTruthy();
		expect(screen.getByText(/2 memories · finds notes with openai/)).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Delete memory: Is vegetarian' }));
		expect(screen.queryByText('Is vegetarian')).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: 'Let the agent remember' }));
		await vi.waitFor(() =>
			expect(asked).toEqual(
				expect.arrayContaining([
					{ type: 'memory:delete', id: 'a' },
					{ type: 'memory:set-enabled', enabled: false }
				])
			)
		);
	});

	it('puts a memory back when deleting it fails', async () => {
		background((req) =>
			req.type === 'memory:delete'
				? { ok: false, status: ready, error: 'raw database failure' }
				: { ok: true, status: ready, items }
		);
		render(<MemorySection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Delete memory: Is vegetarian' }));
		expect(screen.queryByText('Is vegetarian')).toBeNull();
		expect(await screen.findByText('Is vegetarian')).toBeTruthy();
		expect(screen.queryByText(/raw database failure/)).toBeNull();
	});

	it('asks before deleting everything', async () => {
		const asked = background((req) =>
			req.type === 'memory:list' ? { ok: true, status: ready, items } : { ok: true, status: ready }
		);
		render(<MemorySection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Delete all…' }));
		expect(asked.some((r) => r.type === 'memory:delete-all')).toBe(false);
		fireEvent.click(screen.getByRole('button', { name: 'Delete all memories' }));
		await vi.waitFor(() => expect(asked.some((r) => r.type === 'memory:delete-all')).toBe(true));
	});
});
