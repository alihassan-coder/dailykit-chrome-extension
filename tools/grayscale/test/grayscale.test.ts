import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, appliesTo, filterCss, hostOf, resolveState, toggleSkip } from '../src/grayscale.ts';

describe('resolveState', () => {
	it('starts switched off, at full strength, skipping nothing', () => {
		expect(resolveState(undefined)).toEqual(DEFAULT_STATE);
		expect(DEFAULT_STATE).toEqual({ on: false, strength: 100, skip: [] });
	});

	it('keeps valid saved values and repairs broken ones', () => {
		expect(resolveState({ on: true, strength: 40, skip: ['github.com'] })).toEqual({
			on: true,
			strength: 40,
			skip: ['github.com']
		});
		expect(resolveState({ on: 'yes', strength: 400, skip: [3, 'x.com'] })).toEqual({
			on: false,
			strength: 100,
			skip: ['x.com']
		});
		expect(resolveState({ strength: -5 }).strength).toBe(0);
	});
});

describe('appliesTo', () => {
	const state = { on: true, strength: 100, skip: ['figma.com'] };

	it('applies everywhere except skipped sites, including their subdomains', () => {
		expect(appliesTo(state, 'linkedin.com')).toBe(true);
		expect(appliesTo(state, 'figma.com')).toBe(false);
		expect(appliesTo(state, 'www.figma.com')).toBe(false);
		expect(appliesTo(state, 'notfigma.com')).toBe(true);
	});

	it('never applies when switched off or at zero strength', () => {
		expect(appliesTo({ ...state, on: false }, 'linkedin.com')).toBe(false);
		expect(appliesTo({ ...state, strength: 0 }, 'linkedin.com')).toBe(false);
	});
});

describe('toggleSkip and hostOf', () => {
	it('adds and removes a site, ignoring "www."', () => {
		const once = toggleSkip(DEFAULT_STATE, 'www.github.com');
		expect(once.skip).toEqual(['github.com']);
		expect(toggleSkip(once, 'github.com').skip).toEqual([]);
	});

	it('reads the site from a tab address, and nothing from browser pages', () => {
		expect(hostOf('https://www.linkedin.com/feed/')).toBe('linkedin.com');
		expect(hostOf('chrome://extensions')).toBeNull();
		expect(hostOf(undefined)).toBeNull();
	});
});

describe('filterCss', () => {
	it('filters the whole page from the root element', () => {
		expect(filterCss(60)).toBe('html { filter: grayscale(60%) !important; }');
	});
});
