// Turns the user's theme choices into the --tb-* tokens from styles/ui.css. Every surface applies the same
// result, so changing the accent in the dashboard restyles the side panel and in-page UI at once.
import type { Accent, Corners, Density, Theme } from '@toolbelt/core';

type Mode = 'light' | 'dark';

// Each accent has a light-mode and a dark-mode value, tuned for contrast against that mode's surface.
export const ACCENT_COLORS: Record<Accent, { name: string; light: string; dark: string; onDark: string }> = {
	cobalt: { name: 'Cobalt', light: '#2e55e6', dark: '#7e98ff', onDark: '#0d1430' },
	moss: { name: 'Moss', light: '#2f6f4e', dark: '#6cc28f', onDark: '#0b1d13' },
	plum: { name: 'Plum', light: '#7a3d8f', dark: '#c893dc', onDark: '#22102a' },
	copper: { name: 'Copper', light: '#a3521c', dark: '#e39a62', onDark: '#2a1407' },
	graphite: { name: 'Graphite', light: '#2c3531', dark: '#c9d3ce', onDark: '#141917' }
};

const RADIUS: Record<Corners, string> = { sharp: '3px', soft: '10px', round: '16px' };
const DENSITY: Record<Density, string> = { compact: '0.8', comfortable: '1' };

export function resolveMode(mode: Theme['mode'], prefersDark: boolean): Mode {
	return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** The CSS variables and data-theme value for a theme. Pure, so it is easy to test. */
export function themeTokens(theme: Theme, prefersDark: boolean) {
	const mode = resolveMode(theme.mode, prefersDark);
	const accent = ACCENT_COLORS[theme.accent];
	return {
		mode,
		vars: {
			'--tb-accent': mode === 'dark' ? accent.dark : accent.light,
			'--tb-on-accent': mode === 'dark' ? accent.onDark : '#ffffff',
			'--tb-radius': RADIUS[theme.corners],
			'--tb-density': DENSITY[theme.density]
		}
	};
}

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** Applies a theme to an element (a page's <html>, or the container inside a shadow root). */
export function applyTheme(el: HTMLElement, theme: Theme) {
	const { mode, vars } = themeTokens(theme, !!darkQuery()?.matches);
	el.dataset.theme = mode;
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
