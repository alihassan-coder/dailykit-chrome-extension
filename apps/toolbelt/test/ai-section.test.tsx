// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
vi.mock('@toolbelt/ai', () => ({
	testClaudeConnection: vi.fn().mockResolvedValue('Connected using your Claude setup token.')
}));
const { AiSection } = await import('../entrypoints/options/AiSection.tsx');
const token = `sk-ant-oat01-${'a'.repeat(90)}`;
beforeEach(() => fakeBrowser.reset());
afterEach(cleanup);

describe('Claude subscription settings', () => {
	it('validates, saves, tests and removes a setup token while preserving other keys', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { openai: 'sk-other' } });
		render(<AiSection />);
		fireEvent.change(await screen.findByRole('combobox', { name: 'Anthropic connection method' }), {
			target: { value: 'subscription' }
		});
		const input = screen.getByLabelText('Anthropic setup token');
		expect(input.getAttribute('type')).toBe('password');
		fireEvent.change(input, { target: { value: 'sk-ant-oat01-short' } });
		expect((screen.getByRole('button', { name: 'Save token' }) as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(input, { target: { value: ` ${token} ` } });
		fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
		await screen.findByRole('button', { name: 'Replace token' });
		expect((await fakeBrowser.storage.local.get('tb:ai:keys'))['tb:ai:keys']).toEqual({
			openai: 'sk-other',
			anthropic: token
		});
		expect(screen.queryByDisplayValue(token)).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
		expect(await screen.findByRole('status')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Remove token' }));
		await vi.waitFor(async () =>
			expect((await fakeBrowser.storage.local.get('tb:ai:keys'))['tb:ai:keys']).toEqual({ openai: 'sk-other' })
		);
	});

	it('loads a saved token masked and allows switching back to an API key', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: token } });
		render(<AiSection />);
		fireEvent.click(await screen.findByRole('button', { name: 'Replace token' }));
		expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('subscription');
		fireEvent.change(screen.getByRole('combobox'), { target: { value: 'api' } });
		fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: 'sk-ant-api03-replacement' } });
		fireEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0]!);
		await screen.findByRole('button', { name: 'Replace key' });
		expect((await fakeBrowser.storage.local.get('tb:ai:keys'))['tb:ai:keys']).toEqual({
			anthropic: 'sk-ant-api03-replacement'
		});
	});
});
