// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { createSettingsStore } = await import('@toolbelt/core');
const { SettingsProvider, localArea } = await import('@toolbelt/ui');
const { default: ColorPickerPanel } = await import('../src/panel.tsx');

const tools = [{ id: 'color-picker', features: [{ id: 'history', defaultOn: true }] }];

function renderPanel() {
	return render(
		<SettingsProvider store={createSettingsStore(localArea, tools)}>
			<ColorPickerPanel />
		</SettingsProvider>
	);
}

beforeEach(() => {
	fakeBrowser.reset();
	delete window.EyeDropper;
});
afterEach(cleanup);

describe('Colour picker panel', () => {
	it('shows every format of the current colour, with copy buttons', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		renderPanel();
		expect(await screen.findByText('rgb(46, 85, 230)')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Copy HEX' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('#2E55E6'));
	});

	it('explains when the browser has no screen eyedropper', async () => {
		renderPanel();
		expect(await screen.findByText(/no screen eyedropper/)).toBeTruthy();
		expect((screen.getByRole('button', { name: /Pick from screen/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('adds a picked colour to the history', async () => {
		window.EyeDropper = class {
			open = async () => ({ sRGBHex: '#ff5500' });
		};
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: /Pick from screen/ }));
		expect(await screen.findByRole('button', { name: 'Use #FF5500' })).toBeTruthy();
		const stored = await fakeBrowser.storage.local.get('tb:color-picker:history');
		expect(stored['tb:color-picker:history']).toEqual(['#ff5500']);
	});

	it('clears the history', async () => {
		await fakeBrowser.storage.local.set({ 'tb:color-picker:history': ['#111111', '#222222'] });
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Clear recent colours' }));
		expect(await screen.findByText('No colours yet')).toBeTruthy();
	});
});
