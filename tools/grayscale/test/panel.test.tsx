// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { default: GrayscalePanel } = await import('../src/panel.tsx');

const saved = async () => (await fakeBrowser.storage.local.get('tb:grayscale:state'))['tb:grayscale:state'];

beforeEach(() => {
	fakeBrowser.reset();
	// The panel asks which tab is active; answer with a Figma tab.
	vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(
		async () => [{ url: 'https://www.figma.com/file/abc' }] as never
	);
	// No shortcut set, unless a test says otherwise.
	vi.spyOn(fakeBrowser.commands, 'getAll').mockResolvedValue([] as never);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Black and white panel', () => {
	it('switches black and white on for every site', async () => {
		render(<GrayscalePanel />);
		fireEvent.click(await screen.findByRole('switch', { name: 'Black and white' }));
		await waitFor(async () => expect(await saved()).toMatchObject({ on: true }));
		expect(await screen.findByText('On for every site')).toBeTruthy();
	});

	it('counts the sites kept in colour in the status', async () => {
		await fakeBrowser.storage.local.set({
			'tb:grayscale:state': { on: true, strength: 100, skip: ['a.com', 'b.com'] }
		});
		render(<GrayscalePanel />);
		expect(await screen.findByText('· 2 kept in colour', { exact: false })).toBeTruthy();
	});

	it('keeps the current site in colour', async () => {
		render(<GrayscalePanel />);
		const keep = await screen.findByRole('switch', { name: 'Keep figma.com in colour' });
		fireEvent.click(keep);
		await waitFor(async () => expect(await saved()).toMatchObject({ skip: ['figma.com'] }));
		const row = await screen.findByRole('switch', { name: 'figma.com in colour' });
		expect(row.getAttribute('aria-checked')).toBe('true');
	});

	it('switches a listed site back to black and white, and can undo it', async () => {
		await fakeBrowser.storage.local.set({ 'tb:grayscale:state': { on: true, strength: 100, skip: ['github.com'] } });
		render(<GrayscalePanel />);
		fireEvent.click(await screen.findByRole('switch', { name: 'github.com in colour' }));
		await waitFor(async () => expect(await saved()).toMatchObject({ skip: [] }));
		// Still listed, so the slip is one click to undo.
		fireEvent.click(screen.getByRole('switch', { name: 'github.com in colour' }));
		await waitFor(async () => expect(await saved()).toMatchObject({ skip: ['github.com'] }));
		fireEvent.click(screen.getByRole('button', { name: 'Remove github.com' }));
		await waitFor(async () => expect(await saved()).toMatchObject({ skip: [] }));
		await waitFor(() => expect(screen.queryByText('github.com')).toBeNull());
	});

	it('saves the strength when you let go', async () => {
		render(<GrayscalePanel />);
		const slider = await screen.findByRole('slider', { name: 'Strength' });
		fireEvent.change(slider, { target: { value: '40' } });
		fireEvent.keyUp(slider);
		await waitFor(async () => expect(await saved()).toMatchObject({ strength: 40 }));
		expect(screen.getByText('40%')).toBeTruthy();
	});

	it('explains the empty list of colour sites', async () => {
		render(<GrayscalePanel />);
		expect(await screen.findByText('Every site goes black and white')).toBeTruthy();
	});

	it('turns on automatically between two times you pick', async () => {
		render(<GrayscalePanel />);
		fireEvent.click(await screen.findByRole('switch', { name: 'Turn on automatically between two times' }));
		await waitFor(async () =>
			expect(await saved()).toMatchObject({ schedule: { on: true, from: '22:00', to: '07:00' } })
		);
		expect(await screen.findByText('Every day, between these times')).toBeTruthy();
		fireEvent.change(screen.getByLabelText('From'), { target: { value: '21:30' } });
		await waitFor(async () => expect(await saved()).toMatchObject({ schedule: { from: '21:30' } }));
		// Half-typed times are not saved.
		fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } });
		expect(await saved()).toMatchObject({ schedule: { to: '07:00' } });
	});

	it('says when the schedule has it on', async () => {
		vi.useFakeTimers({ now: new Date('2026-11-02T23:00:00'), toFake: ['Date'] });
		await fakeBrowser.storage.local.set({
			'tb:grayscale:state': { on: false, strength: 100, skip: [], schedule: { on: true, from: '22:00', to: '07:00' } }
		});
		render(<GrayscalePanel />);
		expect(await screen.findByText('On by schedule')).toBeTruthy();
		expect(screen.getByText('· until 07:00', { exact: false })).toBeTruthy();
		vi.useRealTimers();
	});

	it('shows the keyboard shortcut that toggles the current site', async () => {
		vi.spyOn(fakeBrowser.commands, 'getAll').mockResolvedValue([
			{ name: 'toggle-grayscale', shortcut: 'Alt+Shift+G' }
		] as never);
		render(<GrayscalePanel />);
		expect(await screen.findByText('Shift')).toBeTruthy();
		expect(screen.getByText('G')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
	});
});

describe('toggleForUrl', () => {
	it('flips the site in a tab, and leaves browser pages alone', async () => {
		const { toggleForUrl, toggleMessage } = await import('../src/actions.ts');
		expect(await toggleForUrl('chrome://settings')).toBeNull();
		const first = await toggleForUrl('https://www.example.com/a');
		expect(first).toEqual({ site: 'example.com', result: 'on' });
		expect(await saved()).toMatchObject({ on: true });
		const second = await toggleForUrl('https://example.com/b');
		expect(second?.result).toBe('kept-in-colour');
		expect(await saved()).toMatchObject({ skip: ['example.com'] });
		expect(toggleMessage('example.com', 'kept-in-colour')).toBe('example.com is kept in colour');
	});
});
