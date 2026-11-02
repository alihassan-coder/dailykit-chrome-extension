// Toolbelt's full-colour logo is the generated raster master; every other mark (and Toolbelt's mono glyph) is
// vector artwork from brand-marks.json, drawn on the shared ToolTile.
import toolbeltImage from './assets/toolbelt-generated-v1-ui.png';
import marks from './brand-marks.json';
import { ToolTile } from './ToolTile.tsx';

export type BrandMark = keyof typeof marks;

type MarkPath = { d: string; stroke?: string; fill?: string; strokeWidth?: number };

/** In mono, every painted part of the glyph takes the text colour. */
const monoPaint = (paint: string | undefined) => (paint && paint !== 'none' ? 'currentColor' : paint);

export function BrandIcon({ mark, size = 20, mono }: { mark: BrandMark; size?: number; mono?: boolean }) {
	if (mark === 'toolbelt' && !mono) {
		return (
			<img
				src={toolbeltImage}
				width={size}
				height={size}
				alt=""
				aria-hidden="true"
				className="shrink-0 object-contain"
			/>
		);
	}
	const art = marks[mark];
	return (
		<ToolTile size={size} from={art.from} to={art.to} mono={mono}>
			{(art.paths as MarkPath[]).map(({ d, stroke, fill, strokeWidth }, index) => (
				<path
					key={index}
					d={d}
					fill={mono ? (monoPaint(fill) ?? 'none') : (fill ?? 'none')}
					stroke={mono ? monoPaint(stroke) : stroke}
					strokeWidth={strokeWidth}
				/>
			))}
		</ToolTile>
	);
}
