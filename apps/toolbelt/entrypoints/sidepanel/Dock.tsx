// The bar at the bottom of the side panel: a floating pill of tool marks (the switcher) and the sync state.
// The pill is a horizontal tab list: arrow keys move, Home/End jump, Enter or Space opens, Alt+1..9 from
// anywhere. The current tool sits on an accent chip that slides between tabs. Tools that do not fit go into
// a "+N" menu at the end of the pill.
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
	Tooltip,
	cn
} from '@toolbelt/ui';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AccountState } from '@toolbelt/core';
import { toolShortcut } from '../../shell/commands.ts';
import type { ToolEntry } from '../../shell/tools.ts';
import { SyncStatus } from './SyncStatus.tsx';
import { ToolIcon, panelId, tabId } from './ToolIcon.tsx';

/** Layout of the pill, in CSS px at default density: a tab, the gap between tabs, and the pill's own frame. */
const TAB = 28;
const GAP = 2;
const FRAME = 6;
/** Room kept for the sync state (its dot alone) and the bar's side padding. */
const RESERVED = 64;
/** Extra room the current tab takes when it shows its name. */
const LABEL = 96;

/**
 * Which tools get a tab and which go into the "+N" menu, for a bar this wide. The current tool always keeps
 * its tab: when it would overflow, it takes the last visible place.
 */
export function splitDock(tools: ToolEntry[], activeId: string | undefined, width: number, labels: boolean) {
	if (width <= 0) return { shown: tools, hidden: [] as ToolEntry[] };
	const room = width - RESERVED - FRAME - (labels ? LABEL : 0);
	const fit = Math.max(1, Math.floor((room + GAP) / (TAB + GAP)));
	if (tools.length <= fit) return { shown: tools, hidden: [] as ToolEntry[] };
	const shown = tools.slice(0, Math.max(1, fit - 1));
	const active = tools.find((t) => t.id === activeId);
	if (active && !shown.includes(active)) shown[shown.length - 1] = active;
	return { shown, hidden: tools.filter((t) => !shown.includes(t)) };
}

interface DockProps {
	tools: ToolEntry[];
	activeId: string | undefined;
	/** Tools whose panel is in the page, so their tab can point at it. */
	mounted: string[];
	onChoose: (id: string) => void;
	/** Show the current tool's name next to its mark (Appearance, "Dock labels"). */
	labels: boolean;
	/** The panel's width in CSS px, to decide what fits. */
	width: number;
}

function Dock({ tools, activeId, mounted, onChoose, labels, width }: DockProps) {
	const tabs = useRef(new Map<string, HTMLButtonElement>());
	const [chip, setChip] = useState<{ x: number; w: number } | null>(null);
	// The chip appears in place the first time, then slides.
	const [settled, setSettled] = useState(false);
	const { shown, hidden } = splitDock(tools, activeId, width, labels);
	const shownKey = shown.map((t) => t.id).join(',');

	useLayoutEffect(() => {
		const el = activeId ? tabs.current.get(activeId) : undefined;
		if (!el) {
			setChip(null);
			return;
		}
		setChip({ x: el.offsetLeft, w: el.offsetWidth });
	}, [activeId, shownKey, labels, width]);

	useLayoutEffect(() => {
		if (!chip || settled) return;
		const id = requestAnimationFrame(() => setSettled(true));
		return () => cancelAnimationFrame(id);
	}, [chip, settled]);

	function onKey(e: KeyboardEvent, index: number) {
		const keys: Record<string, number> = {
			ArrowRight: index + 1,
			ArrowLeft: index - 1,
			Home: 0,
			End: shown.length - 1
		};
		const next = keys[e.key];
		if (next === undefined) return;
		e.preventDefault();
		const tool = shown[(next + shown.length) % shown.length];
		if (tool) tabs.current.get(tool.id)?.focus();
	}

	const shortcut = (id: string) => toolShortcut(tools.findIndex((t) => t.id === id));

	return (
		<nav aria-label="Tools" className="flex shrink-0 items-center gap-0.5 rounded-full bg-raised p-0.5 shadow-float">
			<div role="tablist" aria-label="Tools" aria-orientation="horizontal" className="relative flex gap-0.5">
				{chip && (
					<span
						aria-hidden="true"
						style={{ width: chip.w, transform: `translateX(${chip.x}px)` }}
						className={cn(
							'pointer-events-none absolute inset-y-0 left-0 rounded-full bg-accent-soft',
							settled && 'transition-[transform,width] duration-150 ease-out'
						)}
					>
						<span className="absolute bottom-0.5 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-accent" />
					</span>
				)}
				{shown.map((tool, i) => {
					const current = tool.id === activeId;
					const named = labels && current;
					return (
						<Tooltip key={tool.id} label={tool.name} hint={shortcut(tool.id)} side="top">
							<button
								ref={(el) => {
									if (el) tabs.current.set(tool.id, el);
									else tabs.current.delete(tool.id);
								}}
								type="button"
								id={tabId(tool.id)}
								role="tab"
								aria-label={tool.name}
								aria-selected={current}
								aria-controls={mounted.includes(tool.id) ? panelId(tool.id) : undefined}
								tabIndex={current || (activeId === undefined && i === 0) ? 0 : -1}
								onClick={() => onChoose(tool.id)}
								onKeyDown={(e) => onKey(e, i)}
								className={cn(
									'relative flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-full outline-offset-1',
									named && 'pr-2.5 pl-1.5',
									!current && 'hover:bg-hover'
								)}
							>
								<ToolIcon id={tool.id} size={18} />
								{named && (
									<span aria-hidden="true" className="max-w-24 truncate text-sm font-medium text-ink">
										{tool.name}
									</span>
								)}
							</button>
						</Tooltip>
					);
				})}
			</div>
			{hidden.length > 0 && (
				<DropdownMenu>
					<Tooltip label="More tools" side="top">
						<DropdownMenuTrigger
							aria-label="More tools"
							className="tb-num flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-medium text-muted hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink"
						>
							+{hidden.length}
						</DropdownMenuTrigger>
					</Tooltip>
					<DropdownMenuContent side="top" align="end">
						{hidden.map((tool) => (
							<DropdownMenuItem key={tool.id} onSelect={() => onChoose(tool.id)}>
								<ToolIcon id={tool.id} size={16} />
								{tool.name}
								{shortcut(tool.id) && <DropdownMenuShortcut>{shortcut(tool.id)}</DropdownMenuShortcut>}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</nav>
	);
}

/**
 * The one bar under the tool. Wide panels centre the dock with the sync state on the left; narrow ones put
 * the dock on the left and the sync state on the right. Content scrolls above it, never under it.
 */
export function DockBar({ account, ...dock }: DockProps & { account: AccountState | null }) {
	return (
		<footer className="@container h-11 shrink-0 border-t border-line bg-bg px-2">
			<div className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 @[480px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
				{dock.tools.length > 0 ? <Dock {...dock} /> : <span />}
				<SyncStatus account={account} className="justify-self-end @[480px]:order-first @[480px]:justify-self-start" />
			</div>
		</footer>
	);
}
