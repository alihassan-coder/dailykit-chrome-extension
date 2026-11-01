// Profile lens's mark: a magnifying lens with a person inside it, on a sky tile. The handle is the gold detail.
import { GLYPH_STROKE, GOLD, ToolTile } from '@toolbelt/ui';

export default function ProfileLensIcon({ size = 20 }: { size?: number }) {
	return (
		<ToolTile size={size} from="#5cc2ff" to="#1662c4">
			<circle cx="8.8" cy="8.8" r="5" fill="none" strokeWidth={GLYPH_STROKE} />
			<circle cx="8.8" cy="7.4" r="1.55" />
			<path d="M6 11.6a2.9 2.9 0 0 1 5.6 0Z" />
			<path d="m12.6 12.6 3.4 3.4" fill="none" stroke={GOLD} strokeWidth="2.4" />
		</ToolTile>
	);
}
