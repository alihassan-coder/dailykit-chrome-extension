// Toolbelt uses the generated raster master; tool marks keep their existing vector artwork.
import toolbeltImage from './assets/toolbelt-generated-v1-ui.png';
import marks from './brand-marks.json';
import { ToolTile } from './ToolTile.tsx';

export type BrandMark = keyof typeof marks;

export function BrandIcon({ mark, size = 20 }: { mark: BrandMark; size?: number }) {
	if (mark === 'toolbelt') {
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
		<ToolTile size={size} from={art.from} to={art.to}>
			{art.paths.map((path, index) => (
				<path key={index} fill="none" {...path} />
			))}
		</ToolTile>
	);
}
