// Cairn's mark: three stones stacked into a trail marker, the tool's namesake. The top stone, the one
// that marks the way, is gold.
import { GOLD, ToolTile } from '@toolbelt/ui';

export default function CairnIcon({ size = 20 }: { size?: number }) {
	return (
		<ToolTile size={size} from="#3ad6b8" to="#0a7a6a">
			<ellipse cx="10.6" cy="5.3" rx="2.4" ry="1.55" transform="rotate(-8 10.6 5.3)" fill={GOLD} />
			<ellipse cx="9.5" cy="9.3" rx="3.7" ry="1.85" transform="rotate(5 9.5 9.3)" />
			<ellipse cx="10" cy="14" rx="5.4" ry="2.25" />
		</ToolTile>
	);
}
