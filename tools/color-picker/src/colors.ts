// Colour maths for the colour picker: parsing, formats, WCAG contrast and the history list.

export type Hex = `#${string}`;

/** "#ABC", "abc", "#2E55E6 " -> "#aabbcc" / "#2e55e6"; anything else -> null. */
export function normalizeHex(input: string): Hex | null {
	const s = input.trim().replace(/^#/, '').toLowerCase();
	if (/^[0-9a-f]{3}$/.test(s)) return `#${[...s].map((c) => c + c).join('')}`;
	if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
	return null;
}

function toRgb(hex: string) {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHsl({ r, g, b }: { r: number; g: number; b: number }) {
	const [rn, gn, bn] = [r / 255, g / 255, b / 255];
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return { h: 0, s: 0, l };
	const s = d / (1 - Math.abs(2 * l - 1));
	let h: number;
	if (max === rn) h = ((gn - bn) / d) % 6;
	else if (max === gn) h = (bn - rn) / d + 2;
	else h = (rn - gn) / d + 4;
	return { h: (h * 60 + 360) % 360, s, l };
}

export function formats(hex: Hex) {
	const rgb = toRgb(hex);
	const { h, s, l } = toHsl(rgb);
	return {
		hex: hex.toUpperCase(),
		rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
		hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
	};
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string) {
	const channel = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const { r, g, b } = toRgb(hex);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}

/** WCAG grade for normal-size text. */
export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'Large text only' | 'Fails' {
	if (ratio >= 7) return 'AAA';
	if (ratio >= 4.5) return 'AA';
	if (ratio >= 3) return 'Large text only';
	return 'Fails';
}

export const readableOn = (hex: string): Hex =>
	contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000';

export function addToHistory<T extends string>(history: T[], hex: T, limit = 24): T[] {
	return [hex, ...history.filter((h) => h !== hex)].slice(0, limit);
}
