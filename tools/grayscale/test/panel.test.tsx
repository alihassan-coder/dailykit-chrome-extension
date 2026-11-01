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
});
afterEach(cleanup);

describe('Black and white panel', () => {
	it('switches black and white on for every site', async () => {
		render(<GrayscalePanel />);
		fireEvent.click(screen.getByRole('switch', { name: 'Black and white' }));
		await waitFor(async () => expect(await saved()).toMatchObject({ on: true }));
		expect(await screen.findByText('On for every site you visit')).toBeTruthy();
	});

	it('keeps the current site in colour', async () => {
		render(<GrayscalePanel />);
		const keep = await screen.findByRole('switch', { name: 'Keep figma.com in colour' });
		fireEvent.click(keep);
		await waitFor(async () => expect(await saved()).toMatchObject({ skip: ['figma.com'] }));
		expect(await screen.findByRole('button', { name: 'Turn figma.com black and white again' })).toBeTruthy();
	});

	it('explains the empty list of colour sites', async () => {
		render(<GrayscalePanel />);
		expect(await screen.findByText('Every site goes black and white')).toBeTruthy();
	});
});
