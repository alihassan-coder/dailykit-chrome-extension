import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance, mix, readableOn } from '../src/color.ts';

describe('colour maths', () => {
	it('computes WCAG luminance and contrast', () => {
		expect(luminance('#ffffff')).toBeCloseTo(1, 5);
		expect(luminance('#000000')).toBe(0);
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
		expect(contrastRatio('#2e55e6', '#ffffff')).toBeCloseTo(5.9, 1); // luminance 0.1278: 1.05 / 0.1778
	});

	it('picks the more readable of black and white', () => {
		expect(readableOn('#2e55e6')).toBe('#ffffff');
		expect(readableOn('#ffd400')).toBe('#000000');
	});

	it('mixes two colours by amount, clamped', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(mix('#2e55e6', '#ffffff', 0)).toBe('#2e55e6');
		expect(mix('#2e55e6', '#ffffff', 2)).toBe('#ffffff');
	});
});
