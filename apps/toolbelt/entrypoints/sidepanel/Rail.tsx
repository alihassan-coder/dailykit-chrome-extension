// The toolbar on the right edge: one 36 px row per tool, a vertical tab list (arrow keys move, Home/End jump,
// Enter or Space opens), and the open/collapse button at the bottom. Names show when it is expanded.
import { Dialog, DialogContent, DialogTitle, Kbd, Tooltip, cn } from '@toolbelt/ui';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import type { ToolEntry } from '../../shell/tools.ts';
import { ToolIcon, panelId, tabId } from './ToolIcon.tsx';

interface RailProps {
	tools: ToolEntry[];
	activeId: string | undefined;
	/** Tools whose panel is in the page, so their tab can point at it. */
	mounted: string[];
	expanded: boolean;
	onChoose: (id: string) => void;
	onToggle: () => void;
	/** The copy inside the narrow-panel sheet: no ids, so the docked rail keeps them. */
	sheet?: boolean;
}

function RailRow({
	label,
	expanded,
	hint,
	icon,
	current,
	className,
	...rest
}: {
	label: string;
	expanded: boolean;
	hint?: string;
	icon: ReactNode;
	current?: boolean;
	ref?: (el: HTMLButtonElement | null) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<Tooltip label={label} hint={hint} side="left" disabled={expanded}>
			<button
				type="button"
				aria-label={label}
				{...rest}
				className={cn(
					'relative flex h-9 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-base transition-colors duration-100',
					current ? 'bg-hover font-medium text-ink' : 'text-muted hover:bg-hover hover:text-ink',
					className
				)}
			>
				{current && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
				{icon}
				<span className={cn('min-w-0 flex-1 truncate transition-opacity duration-150', !expanded && 'opacity-0')}>
					{label}
				</span>
				{hint && expanded && <Kbd>{hint}</Kbd>}
			</button>
		</Tooltip>
	);
}

function RailBody({ tools, activeId, mounted, expanded, onChoose, onToggle, sheet }: RailProps) {
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);

	function onKey(e: KeyboardEvent, index: number) {
		const keys: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: tools.length - 1 };
		const next = keys[e.key];
		if (next === undefined) return;
		e.preventDefault();
		buttons.current[(next + tools.length) % tools.length]?.focus();
	}

	const ToggleIcon = expanded ? PanelRightClose : PanelRightOpen;
	return (
		<nav aria-label="Toolbar" className="flex h-full min-h-0 flex-col overflow-hidden border-l border-line bg-surface">
			<div
				role="tablist"
				aria-label="Tools"
				aria-orientation="vertical"
				className="tb-no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-1.5"
			>
				{tools.map((tool, i) => {
					const current = tool.id === activeId;
					return (
						<RailRow
							key={tool.id}
							ref={(el) => {
								buttons.current[i] = el;
							}}
							id={sheet ? undefined : tabId(tool.id)}
							role="tab"
							aria-selected={current}
							aria-controls={mounted.includes(tool.id) ? panelId(tool.id) : undefined}
							tabIndex={current || (activeId === undefined && i === 0) ? 0 : -1}
							label={tool.name}
							expanded={expanded}
							current={current}
							icon={<ToolIcon id={tool.id} size={20} />}
							onClick={() => onChoose(tool.id)}
							onKeyDown={(e) => onKey(e, i)}
						/>
					);
				})}
			</div>
			<div className="shrink-0 border-t border-line p-1.5">
				<RailRow
					label={expanded ? 'Collapse toolbar' : 'Open toolbar'}
					hint="["
					expanded={expanded}
					aria-expanded={expanded}
					icon={
						<span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
							<ToggleIcon className="size-4" strokeWidth={1.75} />
						</span>
					}
					onClick={onToggle}
				/>
			</div>
		</nav>
	);
}

/** The docked rail: 48 px of icons, or wider with names when pinned open on a wide panel. */
export function Rail(props: RailProps) {
	return (
		<div className={cn('h-full shrink-0', props.expanded ? 'w-46' : 'w-12')}>
			<RailBody {...props} />
		</div>
	);
}

/**
 * Narrow panels: the open rail is a modal sheet over the content. Radix traps focus inside it, Escape or the
 * scrim closes it, and focus goes back to `returnFocus` (what had it before).
 */
export function RailSheet({
	open,
	onOpenChange,
	returnFocus,
	...props
}: Omit<RailProps, 'expanded' | 'sheet'> & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	returnFocus: () => HTMLElement | null;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showClose={false}
				aria-describedby={undefined}
				onCloseAutoFocus={(e) => {
					e.preventDefault();
					returnFocus()?.focus();
				}}
				className="top-0 right-0 left-auto flex h-full w-46 max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-surface p-0 shadow-float"
			>
				<DialogTitle className="sr-only">Tools</DialogTitle>
				<RailBody {...props} expanded sheet />
			</DialogContent>
		</Dialog>
	);
}
