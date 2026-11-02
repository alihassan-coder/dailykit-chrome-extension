import { DEFAULT_THEME, contrastRatio } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, accentFor, resolveMode, themeTokens } from '../src/theme.ts';

describe('themeTokens', () => {
	it('follows the system setting when the mode is "system"', () => {
		expect(resolveMode('system', true)).toBe('dark');
		expect(resolveMode('system', false)).toBe('light');
		expect(resolveMode('light', true)).toBe('light');
	});

	it('uses the dark variant of a preset accent in dark mode, with readable text on it', () => {
		const t = themeTokens({ ...DEFAULT_THEME, mode: 'dark', accent: 'moss' }, false);
		expect(t.mode).toBe('dark');
		expect(t.vars['--tb-accent']).toBe(ACCENT_COLORS.moss.dark);
		expect(t.vars['--tb-on-accent']).toBe(ACCENT_COLORS.moss.onDark);
	});

	it('maps corners, density, text size and font to their tokens', () => {
		const t = themeTokens(
			{ ...DEFAULT_THEME, corners: 'round', density: 'compact', textSize: 'large', font: 'system' },
			false
		);
		expect(t.vars['--tb-radius']).toBe('10px');
		expect(t.vars['--tb-density']).toBe('0.875');
		expect(t.vars['--tb-scale']).toBe('1.08');
		expect(t.vars['--tb-font']).toMatch(/^system-ui/);
	});

	it('only sets the high-contrast colours when asked', () => {
		expect(themeTokens(DEFAULT_THEME, false).vars).not.toHaveProperty('--tb-muted');
		expect(themeTokens({ ...DEFAULT_THEME, contrast: 'high' }, true).vars['--tb-ink']).toBe('#ffffff');
	});

	it('passes the motion choice through', () => {
		expect(themeTokens({ ...DEFAULT_THEME, motion: 'reduced' }, false).motion).toBe('reduced');
	});
});

describe('custom accent', () => {
	it('keeps the picked colour in light mode and lightens it for dark mode', () => {
		expect(accentFor('#ff5500', 'light').accent).toBe('#ff5500');
		expect(accentFor('#ff5500', 'dark').accent).not.toBe('#ff5500');
	});

	it('always puts readable text on the accent', () => {
		for (const color of ['#ffd400', '#10204a', '#22c55e', '#ff5500'] as const) {
			for (const mode of ['light', 'dark'] as const) {
				const { accent, onAccent } = accentFor(color, mode);
				expect(contrastRatio(accent, onAccent)).toBeGreaterThanOrEqual(3);
			}
		}
	});
});
