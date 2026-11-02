// Black-and-white mode: the saved state and the rules for where it applies. Shared by the page script and
// the side panel, so both always agree.

/** Black and white between two times of day ("22:00" to "07:00" runs over midnight), on top of the switch. */
export interface Schedule {
	on: boolean;
	/** "HH:MM", 24-hour, local time. */
	from: string;
	to: string;
}

export interface GrayscaleState {
	on: boolean;
	/** 0 to 100, as a grayscale() percentage. */
	strength: number;
	/** Sites left in colour, e.g. "figma.com" (also covers its subdomains). */
	skip: string[];
	schedule: Schedule;
}

export const DEFAULT_SCHEDULE: Schedule = { on: false, from: '22:00', to: '07:00' };
export const DEFAULT_STATE: GrayscaleState = { on: false, strength: 100, skip: [], schedule: DEFAULT_SCHEDULE };
export const STATE_KEY = 'state';

const site = (host: string) => host.replace(/^www\./, '').toLowerCase();

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const asTime = (v: unknown, fallback: string) => (typeof v === 'string' && TIME.test(v) ? v : fallback);

function resolveSchedule(raw: unknown): Schedule {
	const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	return {
		on: r.on === true,
		from: asTime(r.from, DEFAULT_SCHEDULE.from),
		to: asTime(r.to, DEFAULT_SCHEDULE.to)
	};
}

const minutes = (time: string) => {
	const [h, m] = time.split(':').map(Number) as [number, number];
	return h * 60 + m;
};

/** Whether `now` falls inside the schedule's window (from inclusive, to exclusive; over midnight when to < from). */
export function inSchedule(schedule: Schedule, now: Date): boolean {
	if (!schedule.on) return false;
	const from = minutes(schedule.from);
	const to = minutes(schedule.to);
	if (from === to) return false;
	const t = now.getHours() * 60 + now.getMinutes();
	return from < to ? t >= from && t < to : t >= from || t < to;
}

/** Milliseconds until the schedule next switches on or off, or null when there is no schedule. */
export function nextChange(schedule: Schedule, now: Date): number | null {
	if (!schedule.on || schedule.from === schedule.to) return null;
	const t = now.getHours() * 60 + now.getMinutes();
	const ahead = (target: number) => (target - t + 1440) % 1440 || 1440;
	const next = Math.min(ahead(minutes(schedule.from)), ahead(minutes(schedule.to)));
	return next * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

/** On by the switch, or by the schedule right now. */
export const isActive = (state: GrayscaleState, now = new Date()) => state.on || inSchedule(state.schedule, now);

export function resolveState(raw: unknown): GrayscaleState {
	const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const strength = typeof r.strength === 'number' && Number.isFinite(r.strength) ? r.strength : DEFAULT_STATE.strength;
	return {
		on: typeof r.on === 'boolean' ? r.on : DEFAULT_STATE.on,
		strength: Math.round(Math.min(100, Math.max(0, strength))),
		skip: Array.isArray(r.skip) ? [...new Set(r.skip.filter((s): s is string => typeof s === 'string').map(site))] : [],
		schedule: resolveSchedule(r.schedule)
	};
}

export function appliesTo(state: GrayscaleState, host: string, now = new Date()): boolean {
	if (!isActive(state, now) || state.strength === 0) return false;
	const h = site(host);
	return !state.skip.some((s) => h === s || h.endsWith(`.${s}`));
}

export function toggleSkip(state: GrayscaleState, host: string): GrayscaleState {
	const s = site(host);
	return { ...state, skip: state.skip.includes(s) ? state.skip.filter((x) => x !== s) : [...state.skip, s] };
}

export type ToggleResult = 'on' | 'kept-in-colour' | 'back-to-black-and-white';

/**
 * Flips black and white for one site: a site in black and white is kept in colour; a site kept in colour goes
 * back; when the mode is off it is switched on (and the site released, if it was kept in colour).
 */
export function toggleSite(
	state: GrayscaleState,
	host: string,
	now = new Date()
): { state: GrayscaleState; result: ToggleResult } {
	const s = site(host);
	if (appliesTo(state, s, now)) return { state: { ...state, skip: [...state.skip, s] }, result: 'kept-in-colour' };
	const skip = state.skip.filter((x) => x !== s && !s.endsWith(`.${x}`));
	const strength = state.strength === 0 ? 100 : state.strength;
	if (isActive(state, now)) return { state: { ...state, skip, strength }, result: 'back-to-black-and-white' };
	return { state: { ...state, on: true, skip, strength }, result: 'on' };
}

/** The site a tab is on, or null for browser pages (chrome://, the new tab page, ...). */
export function hostOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return u.protocol === 'http:' || u.protocol === 'https:' ? site(u.hostname) : null;
	} catch {
		return null;
	}
}

// Filtering the root element keeps fixed headers working: unlike any other element, a filter on <html>
// does not become the containing block for position: fixed descendants.
export const filterCss = (strength: number) => `html { filter: grayscale(${strength}%) !important; }`;
