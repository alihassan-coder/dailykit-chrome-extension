import { describe, expect, it } from 'vitest';
import { addToHistory, contrastRatio, formats, normalizeHex, readableOn, wcagLevel } from '../src/colors.ts';

describe('normalizeHex', () => {
	it('accepts the usual ways people write a hex colour', () => {
		expect(normalizeHex('#2E55E6')).toBe('#2e55e6');
		expect(normalizeHex('2e55e6')).toBe('#2e55e6');
		expect(normalizeHex('#fff')).toBe('#ffffff');
		expect(normalizeHex(' #ABC ')).toBe('#aabbcc');
	});

	it('rejects anything else', () => {
		for (const bad of ['', '#12', '#12345', 'blue', '#ggg', '#2e55e6ff']) expect(normalizeHex(bad)).toBeNull();
	});
});

describe('formats', () => {
	it('gives HEX, RGB, HSL, OKLCH and a CSS variable for a colour', () => {
		expect(formats('#2e55e6')).toEqual({
			hex: '#2E55E6',
			rgb: 'rgb(46, 85, 230)',
			hsl: 'hsl(227, 79%, 54%)',
			oklch: 'oklch(51.9% 0.223 266.5)',
			css: '--color: #2e55e6;'
		});
		expect(formats('#808080').oklch).toBe('oklch(60% 0 0)'); // greys: no chroma, hue 0
		expect(formats('#ffffff').oklch).toBe('oklch(100% 0 0)');
		expect(formats('#000000').hsl).toBe('hsl(0, 0%, 0%)');
		expect(formats('#ffffff').rgb).toBe('rgb(255, 255, 255)');
	});
});

describe('contrast', () => {
	it('matches the WCAG contrast ratio', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
		expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
		expect(contrastRatio('#2e55e6', '#ffffff')).toBeCloseTo(5.9, 1); // luminance 0.1278: 1.05 / 0.1778
	});

	it('grades body text the way WCAG does', () => {
		expect(wcagLevel(7.2)).toBe('AAA');
		expect(wcagLevel(5.9)).toBe('AA');
		expect(wcagLevel(3.2)).toBe('Large text only');
		expect(wcagLevel(2)).toBe('Fails');
	});

	it('picks black or white text, whichever reads better', () => {
		expect(readableOn('#2e55e6')).toBe('#ffffff');
		expect(readableOn('#f6f7f4')).toBe('#000000');
	});
});

describe('addToHistory', () => {
	it('puts the newest first, without duplicates, and keeps a limit', () => {
		expect(addToHistory(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
		const long = Array.from({ length: 30 }, (_, i) => `#${String(i).padStart(6, '0')}`);
		expect(addToHistory(long, '#abcdef', 24)).toHaveLength(24);
		expect(addToHistory(long, '#abcdef', 24)[0]).toBe('#abcdef');
	});
});
