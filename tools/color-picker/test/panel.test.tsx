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
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Colour picker panel', () => {
	it('shows every format of the current colour, with copy buttons', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		renderPanel();
		expect(await screen.findByText('rgb(46, 85, 230)')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Copy HEX' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('#2E55E6'));
	});

	it('does not claim a copy the browser blocked', async () => {
		const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
		Object.assign(navigator, { clipboard: { writeText } });
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Copy RGB' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('rgb(46, 85, 230)'));
		expect(screen.queryByRole('button', { name: 'Copied RGB' })).toBeNull();
	});

	it('explains when the browser has no screen eyedropper', async () => {
		renderPanel();
		expect(await screen.findByText(/no screen eyedropper/)).toBeTruthy();
		expect((screen.getByRole('button', { name: /Eyedropper/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('adds a picked colour to the history', async () => {
		window.EyeDropper = class {
			open = async () => ({ sRGBHex: '#ff5500' });
		};
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: /Eyedropper/ }));
		expect(await screen.findByRole('button', { name: 'Use #FF5500' })).toBeTruthy();
		const stored = await fakeBrowser.storage.local.get('tb:color-picker:history');
		expect(stored['tb:color-picker:history']).toEqual(['#ff5500']);
	});

	it('picks from screen with the E key', async () => {
		window.EyeDropper = class {
			open = async () => ({ sRGBHex: '#00aa88' });
		};
		renderPanel();
		await screen.findByRole('button', { name: /Eyedropper/ });
		fireEvent.keyDown(document.body, { key: 'e' });
		expect(await screen.findByRole('button', { name: 'Use #00AA88' })).toBeTruthy();
	});

	it('offers OKLCH and a CSS variable, and grades contrast against white and black', async () => {
		renderPanel();
		expect(await screen.findByText('oklch(51.9% 0.223 266.5)')).toBeTruthy();
		expect(screen.getByText('--color: #2e55e6;')).toBeTruthy();
		expect(screen.getByLabelText('White text: AA, 5.9 to 1')).toBeTruthy();
		expect(screen.getByLabelText(/^Black text: /)).toBeTruthy();
	});

	it('checks contrast against a second colour, with AA and AAA for normal and large text', async () => {
		renderPanel();
		// White on the default blue: 5.90 passes AA for normal text but not AAA.
		expect(await screen.findByLabelText('Contrast ratio 5.90 to 1')).toBeTruthy();
		expect(screen.getByLabelText('Normal text AA: passes')).toBeTruthy();
		expect(screen.getByLabelText('Normal text AAA: fails')).toBeTruthy();
		expect(screen.getByLabelText('Large text AAA: passes')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Text #000000' }));
		expect(await screen.findByLabelText('Contrast ratio 3.56 to 1')).toBeTruthy();
		expect(screen.getByLabelText('Normal text AA: fails')).toBeTruthy();
		expect(screen.getByLabelText('Large text AA: passes')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Swap text and background' }));
		// Black is now the colour, the blue its text.
		expect(await screen.findByText('rgb(0, 0, 0)')).toBeTruthy();
		expect(screen.getByLabelText('Contrast ratio 3.56 to 1')).toBeTruthy();
	});

	it('reads the main colours of the page, to use or copy', async () => {
		vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: 3, url: 'https://www.example.com/a' }] as never);
		const execute = vi.fn(async () => [
			{
				result: [
					['#ffffff', 80],
					['#123456', 15],
					['#ff8800', 5]
				]
			}
		]);
		Object.assign(fakeBrowser, { scripting: { executeScript: execute } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Get page palette' }));
		expect(await screen.findByText('From example.com')).toBeTruthy();
		expect(execute).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 3 } }));
		expect(screen.getByText('80%')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Copy #123456' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('#123456'));
		fireEvent.click(screen.getByRole('button', { name: 'Use #FF8800' }));
		expect(await screen.findByText('rgb(255, 136, 0)')).toBeTruthy();
	});

	it('explains a page it cannot read, with the fix', async () => {
		vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: 3, url: 'https://example.com/' }] as never);
		Object.assign(fakeBrowser, {
			scripting: {
				executeScript: vi.fn(async () => {
					throw new Error(
						'Cannot access contents of url "https://example.com/". Extension manifest must request permission to access this host.'
					);
				})
			}
		});
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Get page palette' }));
		expect(await screen.findByText('Toolbelt can’t read this site yet')).toBeTruthy();
	});

	it('opens the eyedropper when the side panel search asks for a pick', async () => {
		window.EyeDropper = class {
			open = async () => ({ sRGBHex: '#abcdef' });
		};
		const { requestPick } = await import('../src/handoff.ts');
		await requestPick();
		renderPanel();
		expect(await screen.findByRole('button', { name: 'Use #ABCDEF' })).toBeTruthy();
		expect((await fakeBrowser.storage.session.get('tb:color-picker:pick'))['tb:color-picker:pick']).toBeFalsy();
	});

	it('clears the history', async () => {
		await fakeBrowser.storage.local.set({ 'tb:color-picker:history': ['#111111', '#222222'] });
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Clear recent colours' }));
		expect(await screen.findByText('No colours yet')).toBeTruthy();
	});
});
