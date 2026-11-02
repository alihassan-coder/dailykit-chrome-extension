// Runs inside the page (through scripting.executeScript), so it must stand alone: no imports, no outer variables.
// It reads the colours that visible elements are painted with and weighs them by how much of the page they cover.

/** [hex, weight] for every colour seen on the page's visible elements. */
export function collectPageColors(maxElements = 4000): [string, number][] {
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const cache = new Map<string, string | null>();
	const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

	// Any CSS colour (rgb, oklch, color(), named) to #rrggbb, or null when mostly transparent or not a colour.
	function toHex(css: string): string | null {
		const known = cache.get(css);
		if (known !== undefined) return known;
		let out: string | null = null;
		const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(css);
		if (m) {
			const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
			out = alpha >= 0.5 ? `#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}` : null;
		} else if (ctx && css && css !== 'none' && !css.startsWith('url(')) {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#010203';
			ctx.fillStyle = css;
			if (ctx.fillStyle !== '#010203' || css === '#010203') {
				ctx.fillRect(0, 0, 1, 1);
				const d = ctx.getImageData(0, 0, 1, 1).data;
				out = (d[3] ?? 0) >= 128 ? `#${hex2(d[0] ?? 0)}${hex2(d[1] ?? 0)}${hex2(d[2] ?? 0)}` : null;
			}
		}
		cache.set(css, out);
		return out;
	}

	const weights = new Map<string, number>();
	const add = (css: string, weight: number) => {
		const hex = toHex(css);
		if (hex && weight > 0) weights.set(hex, (weights.get(hex) ?? 0) + weight);
	};
	const vw = window.innerWidth || 1;
	const vh = window.innerHeight || 1;
	const screen = vw * vh;

	// The page background counts as a full screen, even when only <html> or <body> paints it.
	add(getComputedStyle(document.documentElement).backgroundColor, screen / 1000);
	if (document.body) add(getComputedStyle(document.body).backgroundColor, screen / 1000);

	const elements = document.body ? document.body.querySelectorAll('*') : [];
	for (let i = 0; i < elements.length && i < maxElements; i++) {
		const el = elements[i]!;
		const r = el.getBoundingClientRect();
		// Visible size, within the first three screens of the page.
		if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh * 3) continue;
		const s = getComputedStyle(el);
		if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.1) continue;
		const area = Math.min(r.width * r.height, screen);
		add(s.backgroundColor, area / 1000);
		let text = 0;
		for (const node of el.childNodes) if (node.nodeType === 3) text += (node.textContent ?? '').trim().length;
		if (text) add(s.color, 1 + Math.min(text / 20, 20));
		if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none')
			add(s.borderTopColor, (r.width + r.height) / 400);
		if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') add(s.fill, area / 2000);
	}
	return [...weights];
}
