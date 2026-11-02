// Tools in the dashboard: sort them (drag, the row menu, or Alt+arrow keys), switch whole tools or single
// features on and off. Every change saves instantly and reaches the side panel live.
import { moveTool, orderedTools, setFeature, setToolEnabled, type Settings } from '@toolbelt/core';
import {
	Badge,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
	IconButton,
	Kbd,
	Switch,
	ToolMark,
	cn,
	showError,
	useSettings
} from '@toolbelt/ui';
import {
	ArrowDown,
	ArrowDownToLine,
	ArrowUp,
	ArrowUpToLine,
	ChevronRight,
	GripVertical,
	MoreHorizontal
} from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { icons, sitesLabel, tools, type ToolEntry } from '../../shell/tools.ts';
import { SettingsHeader } from './shared.tsx';

type Drag = {
	onDragStart: () => void;
	onDragEnd: () => void;
	onDragOver: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
};

function ToolRow({
	tool,
	index,
	count,
	onMove,
	drag,
	dragging,
	over,
	flash,
	onFlashEnd,
	change
}: {
	tool: ToolEntry;
	index: number;
	count: number;
	onMove: (toIndex: number) => void;
	drag: Drag;
	dragging: boolean;
	over: boolean;
	flash: boolean;
	onFlashEnd: () => void;
	change: (fn: (s: Settings) => Settings) => void;
}) {
	const { settings } = useSettings();
	const state = settings.tools[tool.id];
	const on = !!state?.enabled;
	const Icon = icons[tool.id];
	const featuresOn = tool.features.filter((f) => state?.features[f.id]).length;
	const [open, setOpen] = useState(false);

	function onKeyDown(e: KeyboardEvent) {
		if (!e.altKey || e.target !== e.currentTarget) return;
		if (e.key === 'ArrowUp' && index > 0) onMove(index - 1);
		else if (e.key === 'ArrowDown' && index < count - 1) onMove(index + 1);
		else return;
		e.preventDefault();
	}

	return (
		<li
			draggable
			tabIndex={0}
			aria-label={`${tool.name}, position ${index + 1} of ${count}`}
			onKeyDown={onKeyDown}
			onAnimationEnd={onFlashEnd}
			{...drag}
			className={cn(
				'group relative outline-none focus-visible:bg-hover',
				dragging && 'opacity-50',
				over && 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-accent',
				flash && 'tb-flash'
			)}
		>
			<Collapsible open={open} onOpenChange={setOpen}>
				<div className="flex min-h-11 items-center gap-2 px-2 py-1.5">
					<span className="cursor-grab text-faint active:cursor-grabbing" aria-hidden="true">
						<GripVertical size={14} />
					</span>
					<ToolMark name={tool.name} size="sm" icon={Icon ? <Icon size={20} /> : undefined} active={on} />
					<div className="ml-1 grid min-w-0 flex-1">
						<p className="truncate text-base font-medium">{tool.name}</p>
						<p className="truncate text-sm text-faint">{tool.description}</p>
					</div>
					<Badge tone="outline" className="max-w-40 truncate max-sm:hidden">
						<span className="truncate">{sitesLabel(tool)}</span>
					</Badge>
					{tool.features.length > 0 && (
						<CollapsibleTrigger
							aria-label={`${tool.name} features, ${featuresOn} of ${tool.features.length} on`}
							className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-sm whitespace-nowrap text-faint tb-num hover:bg-hover hover:text-ink"
						>
							{featuresOn}/{tool.features.length} features
							<ChevronRight size={14} aria-hidden="true" className={cn('transition-transform', open && 'rotate-90')} />
						</CollapsibleTrigger>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton size="xs" label={`${tool.name} actions`}>
								<MoreHorizontal aria-hidden="true" />
							</IconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem disabled={index === 0} onSelect={() => onMove(0)}>
								<ArrowUpToLine aria-hidden="true" /> Move to top
							</DropdownMenuItem>
							<DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
								<ArrowUp aria-hidden="true" /> Move up
								<DropdownMenuShortcut>Alt ↑</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}>
								<ArrowDown aria-hidden="true" /> Move down
								<DropdownMenuShortcut>Alt ↓</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(count - 1)}>
								<ArrowDownToLine aria-hidden="true" /> Move to bottom
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Switch
						label={`${tool.name} on`}
						checked={on}
						onChange={(v) => change((s) => setToolEnabled(s, tool.id, v))}
					/>
				</div>
				{tool.features.length > 0 && (
					<CollapsibleContent>
						<ul className={cn('border-t border-line bg-bg/40 py-1 pr-2 pl-12', !on && 'opacity-50')}>
							{tool.features.map((f) => (
								<li key={f.id} className="flex min-h-8 items-center gap-3 py-1">
									<div className="grid min-w-0 flex-1">
										<p className="truncate text-base">{f.title}</p>
										<p className="truncate text-sm text-faint">{f.description}</p>
									</div>
									<Switch
										size="sm"
										label={f.title}
										checked={!!state?.features[f.id]}
										disabled={!on}
										onChange={(v) => change((s) => setFeature(s, tool.id, f.id, v))}
									/>
								</li>
							))}
						</ul>
					</CollapsibleContent>
				)}
			</Collapsible>
		</li>
	);
}

export function ToolsSection() {
	const { settings, update } = useSettings();
	const list = orderedTools(settings, tools);
	const [dragging, setDragging] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState('');
	const onCount = list.filter((t) => settings.tools[t.id]?.enabled).length;

	const change = (fn: (s: Settings) => Settings) => {
		update(fn).catch((e: unknown) => showError(e));
	};

	function move(id: string, toIndex: number) {
		change((s) => moveTool(s, id, toIndex));
		setFlash(id);
		const name = tools.find((t) => t.id === id)?.name ?? id;
		setAnnouncement(`${name} moved to position ${toIndex + 1} of ${list.length}`);
	}

	return (
		<section aria-labelledby="tools-title" className="grid gap-4">
			<SettingsHeader
				id="tools-title"
				title="Tools"
				description="The order here is the order in the side panel."
				meta={`${onCount} of ${list.length} on`}
			/>
			<ul aria-label="Tools" className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
				{list.map((tool, index) => (
					<ToolRow
						key={tool.id}
						tool={tool}
						index={index}
						count={list.length}
						onMove={(to) => move(tool.id, to)}
						change={change}
						dragging={dragging === tool.id}
						over={over === tool.id && dragging !== null && dragging !== tool.id}
						flash={flash === tool.id}
						onFlashEnd={() => setFlash((f) => (f === tool.id ? null : f))}
						drag={{
							onDragStart: () => setDragging(tool.id),
							onDragEnd: () => {
								setDragging(null);
								setOver(null);
							},
							onDragOver: (e) => {
								e.preventDefault();
								setOver(tool.id);
							},
							onDrop: (e) => {
								e.preventDefault();
								if (dragging && dragging !== tool.id) move(dragging, index);
								setDragging(null);
								setOver(null);
							}
						}}
					/>
				))}
			</ul>
			<p className="flex items-center gap-1.5 px-0.5 text-sm text-faint">
				Drag a tool, or focus it and press <Kbd>Alt</Kbd>
				<Kbd>↑</Kbd>
				<Kbd>↓</Kbd> to move it.
			</p>
			<p className="sr-only" aria-live="polite">
				{announcement}
			</p>
		</section>
	);
}
