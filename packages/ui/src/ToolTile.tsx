// The shared tool tile: a 20×20 grid, a solid plate (radius 5, a barely-there top-to-bottom lightness step) and a
// white glyph drawn with 1.6 round strokes inside the centred 12×12 live area, on pixel centres at 20 px.
// `mono` drops the plate and draws the glyph in currentColor for menus and dense lists; it crops to the 16×16
// around the glyph, so at 16 px the grid maps 1:1 to pixels.
// scripts/render-icons.py mirrors this geometry for the browser's PNG assets.
import { useId, type ReactNode } from 'react';

export function ToolTile({
	size = 20,
	from,
	to,
	mono,
	children
}: {
	size?: number;
	/** Plate colour at the top. */
	from: string;
	/** Plate colour at the bottom. */
	to: string;
	/** Glyph only, in currentColor, no plate. */
	mono?: boolean;
	children: ReactNode;
}) {
	const id = useId();
	if (mono) {
		return (
			<svg width={size} height={size} viewBox="2 2 16 16" aria-hidden="true" className="shrink-0">
				<g strokeLinecap="round" strokeLinejoin="round">
					{children}
				</g>
			</svg>
		);
	}
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<defs>
				<linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={from} />
					<stop offset="1" stopColor={to} />
				</linearGradient>
			</defs>
			<rect width="20" height="20" rx="5" fill={`url(#${id}-plate)`} />
			<g strokeLinecap="round" strokeLinejoin="round">
				{children}
			</g>
		</svg>
	);
}
