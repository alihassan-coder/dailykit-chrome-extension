// Every tool's brand mark is vector artwork from brand-marks.json, drawn on the shared ToolTile. Toolbelt's own
// mark ("Buckle-T", docs/design/logo/README.md) has a dedicated drawing in ToolbeltMark: it needs a buckle slit,
// chrome and a sheen that ToolTile does not draw.
import marks from './brand-marks.json';
import { ToolTile } from './ToolTile.tsx';
import { ToolbeltMark } from './ToolbeltMark.tsx';

export type BrandMark = keyof typeof marks;

type MarkPath = { d: string; stroke?: string; fill?: string; strokeWidth?: number };

/** In mono, every painted part of the glyph takes the text colour. */
const monoPaint = (paint: string | undefined) => (paint && paint !== 'none' ? 'currentColor' : paint);

export function BrandIcon({ mark, size = 20, mono }: { mark: BrandMark; size?: number; mono?: boolean }) {
	if (mark === 'toolbelt') return <ToolbeltMark size={size} mono={mono} />;
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
