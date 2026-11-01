// The shared shape behind every logo, Toolbelt's own included: a rounded tile in the tool's colour, lit from the
// top left, with a soft sheen and a white glyph that sits slightly raised. Glyphs are drawn on a 20-unit grid,
// white, with at most one gold detail (GOLD), so the tools read as one family.
// The toolbar PNGs are rendered from the same recipe (scripts/render-icons.py), so keep the two in step.
import { useId, type ReactNode } from 'react';

export const GLYPH_STROKE = 1.8;
export const GOLD = '#ffc53d';

export function ToolTile({
	size = 20,
	from,
	to,
	children
}: {
	size?: number;
	/** Light colour, top left. */
	from: string;
	/** Deep colour, bottom right. */
	to: string;
	/** The glyph, in a 0–20 viewBox. Shapes are white unless they set their own fill. */
	children: ReactNode;
}) {
	const id = useId();
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<defs>
				<linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor={from} />
					<stop offset="1" stopColor={to} />
				</linearGradient>
				<linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#fff" stopOpacity="0.28" />
					<stop offset="1" stopColor="#fff" stopOpacity="0" />
				</linearGradient>
				<filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="140%">
					<feDropShadow dx="0" dy="0.45" stdDeviation="0.45" floodColor={to} floodOpacity="0.9" />
				</filter>
			</defs>
			<rect width="20" height="20" rx="5.5" fill={`url(#${id}-fill)`} />
			<path d="M5.5 0h9A5.5 5.5 0 0 1 20 5.5V9H0V5.5A5.5 5.5 0 0 1 5.5 0Z" fill={`url(#${id}-sheen)`} />
			<rect
				x="0.35"
				y="0.35"
				width="19.3"
				height="19.3"
				rx="5.15"
				fill="none"
				stroke="#fff"
				strokeOpacity="0.22"
				strokeWidth="0.7"
			/>
			<g
				filter={`url(#${id}-lift)`}
				fill="#fff"
				stroke="#fff"
				strokeWidth="0"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				{children}
			</g>
		</svg>
	);
}
