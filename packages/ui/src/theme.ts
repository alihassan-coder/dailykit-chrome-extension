// Turns the user's theme choices into the --tb-* tokens from styles/ui.css. Every surface applies the same
// result, so changing the accent in the dashboard restyles the side panel and in-page UI at once.
import { contrastRatio, mix, readableOn, type Accent, type AccentPreset, type Theme } from '@toolbelt/core';

type Mode = 'light' | 'dark';

/** Each preset has a fill and a text ("ink") value per mode, tuned for contrast against that mode's surface. */
export const ACCENT_COLORS: Record<
	AccentPreset,
	{ name: string; light: string; lightInk: string; dark: string; darkInk: string; onDark: string }
> = {
	toolbelt: {
		name: 'Toolbelt blue',
		light: '#4467f5',
		lightInk: '#3959da',
		dark: '#4467f5',
		darkInk: '#88a7fd',
		onDark: '#ffffff'
	},
	// Stored as 'cobalt' for older settings; now an ocean blue so it is clearly different from Toolbelt blue.
	cobalt: {
		name: 'Ocean',
		light: '#0a7ea4',
		lightInk: '#086a8a',
		dark: '#0a7799',
		darkInk: '#5cc8eb',
		onDark: '#ffffff'
	},
	moss: { name: 'Moss', light: '#2f6f4e', lightInk: '#2f6f4e', dark: '#2f7a52', darkInk: '#6cc28f', onDark: '#ffffff' },
	plum: { name: 'Plum', light: '#7a3d8f', lightInk: '#7a3d8f', dark: '#8a4aa0', darkInk: '#c893dc', onDark: '#ffffff' },
	copper: {
		name: 'Copper',
		light: '#a3521c',
		lightInk: '#a3521c',
		dark: '#b0591e',
		darkInk: '#e39a62',
		onDark: '#ffffff'
	},
	graphite: {
		name: 'Graphite',
		light: '#27272a',
		lightInk: '#27272a',
		dark: '#e4e4e7',
		darkInk: '#e4e4e7',
		onDark: '#18181b'
	}
};

const RADIUS = { sharp: '3px', soft: '6px', round: '10px' } as const;
const DENSITY = { compact: '0.875', comfortable: '1' } as const;
const TEXT_SCALE = { small: '0.92', default: '1', large: '1.08', larger: '1.16' } as const;
const FONT = {
	toolbelt: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
	system: "system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif"
} as const;

// The surfaces accent text has to stay readable on (styles/ui.css --tb-surface).
const SURFACE: Record<Mode, string> = { light: '#ffffff', dark: '#161618' };

// High contrast pushes secondary text and lines towards the main text colour.
const HIGH_CONTRAST: Record<Mode, Record<string, string>> = {
	light: {
		'--tb-muted': '#27272a',
		'--tb-faint': '#3f3f46',
		'--tb-line': 'rgb(15 15 25 / 0.32)',
		'--tb-ink': '#000000'
	},
	dark: {
		'--tb-muted': '#d4d4d8',
		'--tb-faint': '#c4c4cc',
		'--tb-line': 'rgb(255 255 255 / 0.3)',
		'--tb-ink': '#ffffff'
	}
};

export function resolveMode(mode: Theme['mode'], prefersDark: boolean): Mode {
	return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

const isPreset = (accent: Accent): accent is AccentPreset => accent in ACCENT_COLORS;

/** Moves a colour towards black (light mode) or white (dark mode) until it reads as text on the surface. */
function readableInk(color: string, mode: Mode): string {
	let ink = color;
	for (let i = 0; i < 8 && contrastRatio(ink, SURFACE[mode]) < 4.5; i++)
		ink = mix(ink, mode === 'dark' ? '#ffffff' : '#000000', 0.15);
	return ink;
}

/** Accent fill, the text colour on it, and the accent as readable text, for one mode. */
export function accentFor(accent: Accent, mode: Mode): { accent: string; onAccent: string; ink: string } {
	if (isPreset(accent)) {
		const c = ACCENT_COLORS[accent];
		return mode === 'dark'
			? { accent: c.dark, onAccent: c.onDark, ink: c.darkInk }
			: { accent: c.light, onAccent: '#ffffff', ink: c.lightInk };
	}
	const color = mode === 'dark' ? mix(accent, '#ffffff', 0.25) : accent;
	return { accent: color, onAccent: readableOn(color), ink: readableInk(color, mode) };
}

/** The CSS variables and data attributes for a theme. Pure, so it is easy to test. */
export function themeTokens(theme: Theme, prefersDark: boolean) {
	const mode = resolveMode(theme.mode, prefersDark);
	const { accent, onAccent, ink } = accentFor(theme.accent, mode);
	return {
		mode,
		motion: theme.motion,
		vars: {
			'--tb-accent': accent,
			'--tb-on-accent': onAccent,
			'--tb-accent-ink': ink,
			// A quiet tint of the accent for selected rows and the current tool.
			'--tb-accent-soft': mode === 'dark' ? mix(accent, SURFACE.dark, 0.82) : mix(accent, '#ffffff', 0.9),
			'--tb-radius': RADIUS[theme.corners],
			'--tb-density': DENSITY[theme.density],
			'--tb-scale': TEXT_SCALE[theme.textSize],
			'--tb-font': FONT[theme.font],
			...(theme.contrast === 'high' ? HIGH_CONTRAST[mode] : {})
		} as Record<string, string>
	};
}

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
const CONTRAST_VARS = ['--tb-muted', '--tb-faint', '--tb-line', '--tb-ink'];

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
