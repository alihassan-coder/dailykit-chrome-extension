// Black and white's mark: a circle, one half solid, one half see-through. The only logo without gold:
// it is the tool that takes colour away.
import { GLYPH_STROKE, ToolTile } from '@toolbelt/ui';

export default function GrayscaleIcon({ size = 20 }: { size?: number }) {
	return (
		<ToolTile size={size} from="#8a93a3" to="#262a31">
			<path d="M10 4.6a5.4 5.4 0 0 1 0 10.8Z" fillOpacity="0.35" />
			<path d="M10 4.6a5.4 5.4 0 0 0 0 10.8Z" />
			<circle cx="10" cy="10" r="5.4" fill="none" strokeWidth={GLYPH_STROKE} />
		</ToolTile>
	);
}
