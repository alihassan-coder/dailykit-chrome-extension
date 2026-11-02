// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { testClaudeConnection } = vi.hoisted(() => ({ testClaudeConnection: vi.fn() }));
vi.mock('@toolbelt/ai', () => ({ testClaudeConnection }));
const { AiSection } = await import('../entrypoints/options/AiSection.tsx');
const token = `sk-ant-oat01-${'a'.repeat(90)}`;
const apiKey = `sk-ant-api03-${'k'.repeat(90)}`;
const storedKeys = async () => (await fakeBrowser.storage.local.get('tb:ai:keys'))['tb:ai:keys'];

/** Radix menus and selects open from the keyboard in jsdom (no real pointer events). */
const press = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
async function openMenu(provider: string) {
	press(await screen.findByRole('button', { name: `${provider} actions` }));
}
beforeEach(() => {
	fakeBrowser.reset();
	testClaudeConnection.mockReset().mockResolvedValue('Connected: Claude Haiku responded using your API key.');
});
afterEach(cleanup);

describe('Anthropic key settings', () => {
	it('saves, tests and removes an API key while preserving other keys', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { openai: 'sk-other' } });
		render(<AiSection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Add Anthropic key' }));
		const input = screen.getByLabelText('Anthropic API key');
		expect(input.getAttribute('type')).toBe('password');
		fireEvent.change(input, { target: { value: ` ${apiKey} ` } });
		fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ openai: 'sk-other', anthropic: apiKey }));
		await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.queryByDisplayValue(apiKey)).toBeNull();

		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
		expect(await screen.findByText('Connected')).toBeTruthy();
		expect(testClaudeConnection).toHaveBeenCalledWith(apiKey);

		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove key' }));
		expect(await storedKeys()).toEqual({ openai: 'sk-other', anthropic: apiKey });
		fireEvent.click(await screen.findByRole('button', { name: 'Remove key' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ openai: 'sk-other' }));
	});

	it('refuses a pasted Claude subscription token and says to use an API key', async () => {
		render(<AiSection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Add Anthropic key' }));
		fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: token } });
		expect((screen.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText('Use an Anthropic API key')).toBeTruthy();
		expect(await storedKeys()).toBeUndefined();
	});

	it('shows a failed test as a plain error, never the raw message', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: apiKey } });
		testClaudeConnection.mockRejectedValue(new Error('Claude rejected this key. secret-body'));
		render(<AiSection />);
		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
		expect(await screen.findByText('Invalid')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toContain('Anthropic rejected the key');
		expect(screen.queryByText(/secret-body/)).toBeNull();
	});

	it('flags a subscription token saved by an older version and replaces it with an API key', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: token } });
		render(<AiSection />);
		expect(await screen.findByText('Unsupported')).toBeTruthy();
		expect(screen.getByText('Use an Anthropic API key')).toBeTruthy();
		await openMenu('Anthropic');
		expect(screen.queryByRole('menuitem', { name: 'Test connection' })).toBeNull();
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Replace key' }));
		fireEvent.change(await screen.findByLabelText('Anthropic API key'), { target: { value: apiKey } });
		fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ anthropic: apiKey }));
	});
});
