// Quiet color, generous corners, and clear vector shapes keep the family readable at toolbar size.
// scripts/render-icons.py uses this same tile geometry for the browser's PNG assets.
import { useId, type ReactNode } from 'react';

export function ToolTile({
	size = 20,
	from,
	to,
	children
}: {
	size?: number;
	from: string;
	to: string;
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
			</defs>
			<rect width="20" height="20" rx="5" fill={`url(#${id}-fill)`} />
			<rect
				x="0.4"
				y="0.4"
				width="19.2"
				height="19.2"
				rx="4.6"
				fill="none"
				stroke="#fff"
				strokeOpacity="0.12"
				strokeWidth="0.6"
			/>
			<g strokeLinecap="round" strokeLinejoin="round">
				{children}
			</g>
		</svg>
	);
}
