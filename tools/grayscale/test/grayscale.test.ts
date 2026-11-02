import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SCHEDULE,
	DEFAULT_STATE,
	appliesTo,
	filterCss,
	hostOf,
	inSchedule,
	nextChange,
	resolveState,
	toggleSite,
	toggleSkip
} from '../src/grayscale.ts';

describe('resolveState', () => {
	it('starts switched off, at full strength, skipping nothing', () => {
		expect(resolveState(undefined)).toEqual(DEFAULT_STATE);
		expect(DEFAULT_STATE).toEqual({ on: false, strength: 100, skip: [], schedule: DEFAULT_SCHEDULE });
	});

	it('keeps valid saved values and repairs broken ones', () => {
		expect(resolveState({ on: true, strength: 40, skip: ['github.com'] })).toEqual({
			on: true,
			strength: 40,
			skip: ['github.com'],
			schedule: DEFAULT_SCHEDULE
		});
		expect(resolveState({ on: 'yes', strength: 400, skip: [3, 'x.com'] })).toEqual({
			on: false,
			strength: 100,
			skip: ['x.com'],
			schedule: DEFAULT_SCHEDULE
		});
		expect(resolveState({ schedule: { on: true, from: '25:00', to: '06:30' } }).schedule).toEqual({
			on: true,
			from: '22:00',
			to: '06:30'
		});
		expect(resolveState({ strength: -5 }).strength).toBe(0);
	});
});

describe('appliesTo', () => {
	const state = { on: true, strength: 100, skip: ['figma.com'], schedule: DEFAULT_SCHEDULE };

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

const at = (time: string) => new Date(`2026-11-02T${time}:00`);

describe('the schedule', () => {
	const night = { on: true, from: '22:00', to: '07:00' };

	it('runs over midnight, and between two times on the same day', () => {
		expect(inSchedule(night, at('23:30'))).toBe(true);
		expect(inSchedule(night, at('06:59'))).toBe(true);
		expect(inSchedule(night, at('07:00'))).toBe(false);
		expect(inSchedule(night, at('12:00'))).toBe(false);
		const day = { on: true, from: '09:00', to: '17:00' };
		expect(inSchedule(day, at('09:00'))).toBe(true);
		expect(inSchedule(day, at('17:00'))).toBe(false);
		expect(inSchedule({ ...night, on: false }, at('23:30'))).toBe(false);
	});

	it('turns black and white on inside the window even with the switch off', () => {
		const state = { ...DEFAULT_STATE, schedule: night };
		expect(appliesTo(state, 'example.com', at('23:00'))).toBe(true);
		expect(appliesTo(state, 'example.com', at('12:00'))).toBe(false);
	});

	it('knows when it next changes', () => {
		expect(nextChange(night, at('21:00'))).toBe(60 * 60_000);
		expect(nextChange(night, at('23:00'))).toBe(8 * 60 * 60_000);
		expect(nextChange({ ...night, on: false }, at('21:00'))).toBeNull();
	});
});

describe('toggleSite', () => {
	const on = { ...DEFAULT_STATE, on: true };

	it('keeps a black-and-white site in colour, and back again', () => {
		const kept = toggleSite(on, 'www.figma.com');
		expect(kept.result).toBe('kept-in-colour');
		expect(kept.state.skip).toEqual(['figma.com']);
		const back = toggleSite(kept.state, 'figma.com');
		expect(back.result).toBe('back-to-black-and-white');
		expect(back.state.skip).toEqual([]);
	});

	it('switches the mode on when it is off', () => {
		const next = toggleSite({ ...DEFAULT_STATE, skip: ['figma.com'] }, 'figma.com', at('12:00'));
		expect(next.result).toBe('on');
		expect(next.state).toMatchObject({ on: true, skip: [] });
	});
});
