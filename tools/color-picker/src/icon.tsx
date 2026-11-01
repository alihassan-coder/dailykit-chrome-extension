// Colour picker's mark: a pipette (bulb, collar, tapered glass) leaning to the left, a gold drop at its tip.
import { GOLD, ToolTile } from '@toolbelt/ui';

export default function ColorPickerIcon({ size = 20 }: { size?: number }) {
	return (
		<ToolTile size={size} from="#ff7eb0" to="#b8215c">
			{/* Drawn upright, then turned 45° around the centre. */}
			<g transform="rotate(45 10 10)">
				<rect x="8.4" y="2.4" width="3.2" height="4.6" rx="1.6" />
				<rect x="7.3" y="6.9" width="5.4" height="1.9" rx="0.95" />
				<path d="M9 8.7h2l-.35 6.1a.65.65 0 0 1-1.3 0Z" />
				<circle cx="10" cy="17.1" r="1.3" fill={GOLD} />
			</g>
		</ToolTile>
	);
}
