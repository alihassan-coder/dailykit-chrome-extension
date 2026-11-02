// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { testClaudeConnection } = vi.hoisted(() => ({ testClaudeConnection: vi.fn() }));
vi.mock('@toolbelt/ai', () => ({ testClaudeConnection }));
const { AiSection } = await import('../entrypoints/options/AiSection.tsx');
const token = `sk-ant-oat01-${'a'.repeat(90)}`;
const storedKeys = async () => (await fakeBrowser.storage.local.get('tb:ai:keys'))['tb:ai:keys'];

/** Radix menus and selects open from the keyboard in jsdom (no real pointer events). */
const press = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
async function openMenu(provider: string) {
	press(await screen.findByRole('button', { name: `${provider} actions` }));
}
async function chooseMethod(label: string) {
	press(screen.getByRole('combobox', { name: 'Anthropic connection method' }));
	press(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
	fakeBrowser.reset();
	testClaudeConnection.mockReset().mockResolvedValue('Connected using your Claude setup token.');
});
afterEach(cleanup);

describe('Claude subscription settings', () => {
	it('validates, saves, tests and removes a setup token while preserving other keys', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { openai: 'sk-other' } });
		render(<AiSection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Add Anthropic key' }));
		await chooseMethod('Claude subscription (setup token)');
		const input = screen.getByLabelText('Anthropic setup token');
		expect(input.getAttribute('type')).toBe('password');
		fireEvent.change(input, { target: { value: 'sk-ant-oat01-short' } });
		expect((screen.getByRole('button', { name: 'Save token' }) as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(input, { target: { value: ` ${token} ` } });
		fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ openai: 'sk-other', anthropic: token }));
		await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.queryByDisplayValue(token)).toBeNull();

		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
		expect(await screen.findByText('Connected')).toBeTruthy();
		expect(testClaudeConnection).toHaveBeenCalledWith(token);

		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove token' }));
		expect(await storedKeys()).toEqual({ openai: 'sk-other', anthropic: token });
		fireEvent.click(await screen.findByRole('button', { name: 'Remove token' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ openai: 'sk-other' }));
	});

	it('shows a failed test as a plain error, never the raw message', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: token } });
		testClaudeConnection.mockRejectedValue(new Error('Claude rejected this setup token. secret-body'));
		render(<AiSection />);
		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
		expect(await screen.findByText('Invalid')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toContain('Anthropic rejected the key');
		expect(screen.queryByText(/secret-body/)).toBeNull();
	});

	it('loads a saved token masked and allows switching back to an API key', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: token } });
		render(<AiSection />);
		expect(await screen.findByText('sk-ant-…aaaa')).toBeTruthy();
		await openMenu('Anthropic');
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Replace token' }));
		const method = await screen.findByRole('combobox', { name: 'Anthropic connection method' });
		expect(method.textContent).toContain('Claude subscription (setup token)');
		await chooseMethod('API key');
		fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: 'sk-ant-api03-replacement' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
		await vi.waitFor(async () => expect(await storedKeys()).toEqual({ anthropic: 'sk-ant-api03-replacement' }));
	});
});
