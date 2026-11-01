import { DEFAULT_THEME } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, resolveMode, themeTokens } from '../src/theme.ts';

describe('themeTokens', () => {
	it('follows the system setting when the mode is "system"', () => {
		expect(resolveMode('system', true)).toBe('dark');
		expect(resolveMode('system', false)).toBe('light');
		expect(resolveMode('light', true)).toBe('light');
	});

	it('uses the dark variant of the accent in dark mode, with readable text on it', () => {
		const t = themeTokens({ ...DEFAULT_THEME, mode: 'dark', accent: 'moss' }, false);
		expect(t.mode).toBe('dark');
		expect(t.vars['--tb-accent']).toBe(ACCENT_COLORS.moss.dark);
		expect(t.vars['--tb-on-accent']).toBe(ACCENT_COLORS.moss.onDark);
	});

	it('maps corners and density to the size tokens', () => {
		const t = themeTokens({ ...DEFAULT_THEME, corners: 'round', density: 'compact' }, false);
		expect(t.vars['--tb-radius']).toBe('16px');
		expect(t.vars['--tb-density']).toBe('0.8');
	});
});
