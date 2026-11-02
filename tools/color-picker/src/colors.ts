// Colour maths for the colour picker: parsing, formats, WCAG grades and the history list.
// Contrast itself lives in @toolbelt/core, shared with the theme engine.
import { contrastRatio, readableOn } from '@toolbelt/core';

export { contrastRatio, readableOn };

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

const linear = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB -> OKLCH (Björn Ottosson's OKLab matrices). */
function toOklch({ r, g, b }: { r: number; g: number; b: number }) {
	const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const C = Math.hypot(A, B);
	// Greys have no meaningful hue; CSS writes it as 0.
	const H = C < 0.0005 ? 0 : (Math.atan2(B, A) * 180) / Math.PI;
	return { l: L, c: C, h: (H + 360) % 360 };
}

const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

export function formats(hex: Hex) {
	const rgb = toRgb(hex);
	const { h, s, l } = toHsl(rgb);
	const ok = toOklch(rgb);
	return {
		hex: hex.toUpperCase(),
		rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
		hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
		oklch: `oklch(${trim(ok.l * 100, 1)}% ${trim(ok.c, 3)} ${trim(ok.h, 1)})`,
		css: `--color: ${hex};`
	};
}

/** WCAG grade for normal-size text. */
export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'Large text only' | 'Fails' {
	if (ratio >= 7) return 'AAA';
	if (ratio >= 4.5) return 'AA';
	if (ratio >= 3) return 'Large text only';
	return 'Fails';
}

export function addToHistory<T extends string>(history: T[], hex: T, limit = 24): T[] {
	return [hex, ...history.filter((h) => h !== hex)].slice(0, limit);
}

/** WCAG 2 thresholds: normal text needs 4.5 (AA) / 7 (AAA); large text (18pt, or 14pt bold) 3 / 4.5. */
export function contrastGrades(ratio: number) {
	return {
		normalAA: ratio >= 4.5,
		normalAAA: ratio >= 7,
		largeAA: ratio >= 3,
		largeAAA: ratio >= 4.5
	};
}

const distance = (a: Hex, b: Hex) => {
	const x = toRgb(a);
	const y = toRgb(b);
	return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
};

export interface PaletteColor {
	hex: Hex;
	/** Share of the page's colour weight, 0 to 1. */
	share: number;
}

/**
 * The page's main colours from weighted samples (hex, weight): near-identical shades are merged into the heavier
 * one, so eight swatches show eight different colours.
 */
export function rankColors(samples: [string, number][], limit = 8, minDistance = 28): PaletteColor[] {
	const weights = new Map<Hex, number>();
	for (const [raw, weight] of samples) {
		const hex = normalizeHex(raw);
		if (hex && Number.isFinite(weight) && weight > 0) weights.set(hex, (weights.get(hex) ?? 0) + weight);
	}
	const total = [...weights.values()].reduce((a, b) => a + b, 0);
	const picked: { hex: Hex; weight: number }[] = [];
	for (const [hex, weight] of [...weights].sort((a, b) => b[1] - a[1])) {
		const near = picked.find((p) => distance(p.hex, hex) < minDistance);
		if (near) near.weight += weight;
		else picked.push({ hex, weight });
	}
	return picked
		.sort((a, b) => b.weight - a.weight)
		.slice(0, limit)
		.map((p) => ({ hex: p.hex, share: total ? p.weight / total : 0 }));
}
