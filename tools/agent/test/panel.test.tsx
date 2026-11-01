// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { createSettingsStore } = await import('@toolbelt/core');
const { SettingsProvider, localArea } = await import('@toolbelt/ui');
const { default: AgentPanel } = await import('../src/panel.tsx');

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
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } });
		renderPanel();
		const picker = (await screen.findByRole('combobox', { name: 'Model' })) as HTMLSelectElement;
		expect(picker.value).toBe('anthropic|claude-opus-5-5');
		expect(screen.getByRole('textbox', { name: 'Ask the agent' })).toBeTruthy();
	});
});
