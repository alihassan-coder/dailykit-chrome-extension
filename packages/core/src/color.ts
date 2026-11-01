// Colour maths shared by the theme engine and the colour picker: WCAG contrast and simple mixing.

function toRgb(hex: string) {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = (r: number, g: number, b: number) =>
	`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` as const;

/** WCAG 2.x relative luminance of a "#rrggbb" colour. */
export function luminance(hex: string): number {
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

/** Black or white, whichever is easier to read on this colour. */
export const readableOn = (hex: string): '#ffffff' | '#000000' =>
	contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000';

/** Blend two colours; amount 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, amount: number): `#${string}` {
	const x = toRgb(a);
	const y = toRgb(b);
	const t = Math.min(1, Math.max(0, amount));
	return toHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}
