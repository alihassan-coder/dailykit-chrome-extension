// Turns the user's theme choices into the --tb-* tokens from styles/ui.css. Every surface applies the same
// result, so changing the accent in the dashboard restyles the side panel and in-page UI at once.
import { mix, readableOn, type Accent, type AccentPreset, type Theme } from '@toolbelt/core';

type Mode = 'light' | 'dark';

// Each preset has a light-mode and a dark-mode value, tuned for contrast against that mode's surface.
export const ACCENT_COLORS: Record<AccentPreset, { name: string; light: string; dark: string; onDark: string }> = {
	toolbelt: { name: 'Toolbelt blue', light: '#4467f5', dark: '#8ea3ff', onDark: '#0b1540' },
	// Stored as 'cobalt' for older settings; now an ocean blue so it is clearly different from Toolbelt blue.
	cobalt: { name: 'Ocean', light: '#0a7ea4', dark: '#5cc8eb', onDark: '#04222d' },
	moss: { name: 'Moss', light: '#2f6f4e', dark: '#6cc28f', onDark: '#0b1d13' },
	plum: { name: 'Plum', light: '#7a3d8f', dark: '#c893dc', onDark: '#22102a' },
	copper: { name: 'Copper', light: '#a3521c', dark: '#e39a62', onDark: '#2a1407' },
	graphite: { name: 'Graphite', light: '#2c3531', dark: '#c9d3ce', onDark: '#141917' }
};

const RADIUS = { sharp: '3px', soft: '10px', round: '16px' } as const;
const DENSITY = { compact: '0.8', comfortable: '1' } as const;
const TEXT_SCALE = { small: '0.92', default: '1', large: '1.08', larger: '1.16' } as const;
const FONT = {
	toolbelt: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', 'Segoe UI', system-ui, sans-serif",
	system: "system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif"
} as const;

// High contrast pushes secondary text and lines towards the main text colour.
const HIGH_CONTRAST: Record<Mode, Record<string, string>> = {
	light: { '--tb-muted': '#2f3a35', '--tb-line': '#8a958f', '--tb-ink': '#000000' },
	dark: { '--tb-muted': '#d0d9d4', '--tb-line': '#6b7872', '--tb-ink': '#ffffff' }
};

export function resolveMode(mode: Theme['mode'], prefersDark: boolean): Mode {
	return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

const isPreset = (accent: Accent): accent is AccentPreset => accent in ACCENT_COLORS;

/** Accent and the text colour on it, for one mode. A custom colour is lightened for dark mode. */
export function accentFor(accent: Accent, mode: Mode): { accent: string; onAccent: string } {
	if (isPreset(accent)) {
		const c = ACCENT_COLORS[accent];
		return mode === 'dark' ? { accent: c.dark, onAccent: c.onDark } : { accent: c.light, onAccent: '#ffffff' };
	}
	const color = mode === 'dark' ? mix(accent, '#ffffff', 0.25) : accent;
	return { accent: color, onAccent: readableOn(color) };
}

/** The CSS variables and data attributes for a theme. Pure, so it is easy to test. */
export function themeTokens(theme: Theme, prefersDark: boolean) {
	const mode = resolveMode(theme.mode, prefersDark);
	const { accent, onAccent } = accentFor(theme.accent, mode);
	return {
		mode,
		motion: theme.motion,
		vars: {
			'--tb-accent': accent,
			'--tb-on-accent': onAccent,
			// A quiet tint of the accent for selected rows and the current tool.
			'--tb-accent-soft': mode === 'dark' ? mix(accent, '#202124', 0.72) : mix(accent, '#ffffff', 0.86),
			'--tb-radius': RADIUS[theme.corners],
			'--tb-density': DENSITY[theme.density],
			'--tb-scale': TEXT_SCALE[theme.textSize],
			'--tb-font': FONT[theme.font],
			...(theme.contrast === 'high' ? HIGH_CONTRAST[mode] : {})
		} as Record<string, string>
	};
}

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
const CONTRAST_VARS = ['--tb-muted', '--tb-line', '--tb-ink'];

/** Applies a theme to an element (a page's <html>, or the container inside a shadow root). */
export function applyTheme(el: HTMLElement, theme: Theme) {
	const { mode, motion, vars } = themeTokens(theme, !!darkQuery()?.matches);
	el.dataset.theme = mode;
	el.dataset.motion = motion;
	el.style.colorScheme = mode;
	for (const name of CONTRAST_VARS) el.style.removeProperty(name);
	for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
}

/** Re-applies when the OS switches between light and dark, for themes that follow the system. */
export function followSystemMode(el: HTMLElement, getTheme: () => Theme): () => void {
	const q = darkQuery();
	if (!q) return () => {};
	const onChange = () => applyTheme(el, getTheme());
	q.addEventListener('change', onChange);
	return () => q.removeEventListener('change', onChange);
}
