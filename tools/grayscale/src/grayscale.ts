// Black-and-white mode: the saved state and the rules for where it applies. Shared by the page script and
// the side panel, so both always agree.

export interface GrayscaleState {
	on: boolean;
	/** 0 to 100, as a grayscale() percentage. */
	strength: number;
	/** Sites left in colour, e.g. "figma.com" (also covers its subdomains). */
	skip: string[];
}

export const DEFAULT_STATE: GrayscaleState = { on: false, strength: 100, skip: [] };
export const STATE_KEY = 'state';

const site = (host: string) => host.replace(/^www\./, '').toLowerCase();

export function resolveState(raw: unknown): GrayscaleState {
	const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const strength = typeof r.strength === 'number' && Number.isFinite(r.strength) ? r.strength : DEFAULT_STATE.strength;
	return {
		on: typeof r.on === 'boolean' ? r.on : DEFAULT_STATE.on,
		strength: Math.round(Math.min(100, Math.max(0, strength))),
		skip: Array.isArray(r.skip) ? [...new Set(r.skip.filter((s): s is string => typeof s === 'string').map(site))] : []
	};
}

export function appliesTo(state: GrayscaleState, host: string): boolean {
	if (!state.on || state.strength === 0) return false;
	const h = site(host);
	return !state.skip.some((s) => h === s || h.endsWith(`.${s}`));
}

export function toggleSkip(state: GrayscaleState, host: string): GrayscaleState {
	const s = site(host);
	return { ...state, skip: state.skip.includes(s) ? state.skip.filter((x) => x !== s) : [...state.skip, s] };
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
