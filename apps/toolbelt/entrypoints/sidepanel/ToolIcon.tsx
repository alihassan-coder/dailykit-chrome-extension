import { icons } from '../../shell/tools.ts';

/** A tool's own mark, as designed (it brings its tile and colours). Decorative: the name is always next to it. */
export function ToolIcon({ id, size }: { id: string; size: 16 | 20 }) {
	const Icon = icons[id];
	if (!Icon) return null;
	return (
		<span aria-hidden="true" className="grid shrink-0 place-items-center">
			<Icon size={size} />
		</span>
	);
}

/** Ids shared by the rail's tabs and the tool panels they control. */
export const tabId = (id: string) => `tb-tab-${id}`;
export const panelId = (id: string) => `tb-panel-${id}`;
