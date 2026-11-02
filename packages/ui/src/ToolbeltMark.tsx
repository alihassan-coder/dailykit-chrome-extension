// Toolbelt's own mark, "Buckle-T" (docs/design/logo/README.md, v2): a chrome buckle is the crossbar of a T, the
// leather strap is its stem, and the prong runs down into the amber-lit hole: every tool fastened into one belt.
// It gets its own drawing because it needs a buckle slit, chrome and a top sheen that the shared ToolTile does not
// draw. Every edge sits on whole pixels of the 20 grid, so it stays crisp at 16–24 px. brand-marks.json → toolbelt
// holds the same geometry in flat colours for scripts/render-icons.py.
import { useId } from 'react';

const FRAME = 'M4 2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1 3v1h10V5Z';
const PRONG = 'M9 4a1 1 0 0 1 2 0v10H9Z';

export function ToolbeltMark({ size = 20, mono }: { size?: number; mono?: boolean }) {
	const id = useId();
	if (mono) {
		// One colour: the buckle, and the strap with its hole knocked out (the prong merges into the strap).
		return (
			<svg width={size} height={size} viewBox="2 2 16 16" aria-hidden="true" className="shrink-0">
				<g fill="currentColor" fillRule="evenodd">
					<path d={FRAME} />
					<path d="M7 9h6v10H7Zm2 6v2h2v-2Z" />
					<path d={PRONG} />
				</g>
			</svg>
		);
	}
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
			<defs>
				<linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#6A88FF" />
					<stop offset="1" stopColor="#2E44CC" />
				</linearGradient>
				<linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.2" />
					<stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
				</linearGradient>
				<linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#FFFFFF" />
					<stop offset="1" stopColor="#D3DAEA" />
				</linearGradient>
			</defs>
			<rect width="20" height="20" rx="5" fill={`url(#${id}-plate)`} />
			<path d="M7 8h6v12H7Z" fill="#16225E" />
			<rect width="20" height="20" rx="5" fill={`url(#${id}-sheen)`} />
			<path d={FRAME} fill={`url(#${id}-chrome)`} fillRule="evenodd" />
			<path d={PRONG} fill="#FFFFFF" />
			<path d="M9 14h2v2H9Z" fill="#FFC53D" />
		</svg>
	);
}
