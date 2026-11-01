// Tools in the dashboard: sort them (drag, or the arrow buttons / Alt+arrow keys), switch whole tools or
// single features on and off. Every change saves instantly and reaches the side panel live.
import { moveTool, setFeature, setToolEnabled, orderedTools } from '@toolbelt/core';
import { IconButton, Switch, ToolMark, useSettings } from '@toolbelt/ui';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { icons, sitesLabel, tools, type ToolEntry } from '../../shell/tools.ts';

function ToolRow({
	tool,
	index,
	count,
	onMove,
	dragHandlers
}: {
	tool: ToolEntry;
	index: number;
	count: number;
	onMove: (toIndex: number) => void;
	dragHandlers: Record<string, unknown>;
}) {
	const { settings, update } = useSettings();
	const state = settings.tools[tool.id];
	const on = !!state?.enabled;
	const Icon = icons[tool.id];

	function onKeyDown(e: KeyboardEvent) {
		if (!e.altKey) return;
		if (e.key === 'ArrowUp' && index > 0) onMove(index - 1);
		else if (e.key === 'ArrowDown' && index < count - 1) onMove(index + 1);
		else return;
		e.preventDefault();
	}

	return (
		<li
			{...dragHandlers}
			onKeyDown={onKeyDown}
			className="rounded-lg border border-line bg-surface data-[dragging=true]:opacity-50 data-[over=true]:border-accent"
		>
			<div className="flex items-center gap-3 p-3">
				<span className="cursor-grab text-muted" aria-hidden="true">
					<GripVertical size={16} />
				</span>
				<ToolMark name={tool.name} icon={Icon ? <Icon size={18} /> : undefined} active={on} />
				<div className="min-w-0 flex-1">
					<p className="font-semibold">{tool.name}</p>
					<p className="truncate text-sm text-muted">{tool.description}</p>
				</div>
				<span className="hidden rounded-full bg-soft px-2.5 py-0.5 text-xs text-muted sm:inline">
					{sitesLabel(tool)}
				</span>
				<div className="flex">
					<IconButton
						label={`Move ${tool.name} up`}
						disabled={index === 0}
						onClick={() => onMove(index - 1)}
						className="disabled:opacity-30"
					>
						<ChevronUp size={16} />
					</IconButton>
					<IconButton
						label={`Move ${tool.name} down`}
						disabled={index === count - 1}
						onClick={() => onMove(index + 1)}
						className="disabled:opacity-30"
					>
						<ChevronDown size={16} />
					</IconButton>
				</div>
				<Switch
					label={`${tool.name} on`}
					checked={on}
					onChange={(v) => void update((s) => setToolEnabled(s, tool.id, v))}
				/>
			</div>

			{tool.features.length > 0 && (
				<ul className={`border-t border-line px-3 py-1 pl-14 ${on ? '' : 'opacity-50'}`}>
					{tool.features.map((f) => (
						<li
							key={f.id}
							className="flex min-h-11 items-center justify-between gap-3 border-t border-line first:border-t-0"
						>
							<div className="min-w-0">
								<p className="text-sm">{f.title}</p>
								<p className="truncate text-xs text-muted">{f.description}</p>
							</div>
							<Switch
								label={f.title}
								checked={!!state?.features[f.id]}
								disabled={!on}
								onChange={(v) => void update((s) => setFeature(s, tool.id, f.id, v))}
							/>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}

export function ToolsSection() {
	const { settings, update } = useSettings();
	const list = orderedTools(settings, tools);
	const [dragging, setDragging] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState('');

	function move(id: string, toIndex: number) {
		void update((s) => moveTool(s, id, toIndex));
		const name = tools.find((t) => t.id === id)?.name ?? id;
		setAnnouncement(`${name} moved to position ${toIndex + 1} of ${list.length}`);
	}

	return (
		<section aria-labelledby="tools-title" className="grid gap-4">
			<div>
				<h2 id="tools-title" className="text-xl font-semibold">
					Tools
				</h2>
				<p className="text-sm text-muted">
					The order here is the order in the side panel. Drag a tool, or focus it and press Alt with an arrow key.
				</p>
			</div>
			<ul className="grid gap-2">
				{list.map((tool, index) => (
					<ToolRow
						key={tool.id}
						tool={tool}
						index={index}
						count={list.length}
						onMove={(to) => move(tool.id, to)}
						dragHandlers={{
							draggable: true,
							tabIndex: 0,
							'data-dragging': dragging === tool.id,
							'data-over': over === tool.id && dragging !== tool.id,
							onDragStart: () => setDragging(tool.id),
							onDragEnd: () => {
								setDragging(null);
								setOver(null);
							},
							onDragOver: (e: DragEvent) => {
								e.preventDefault();
								setOver(tool.id);
							},
							onDrop: () => dragging && move(dragging, index)
						}}
					/>
				))}
			</ul>
			<p className="sr-only" aria-live="polite">
				{announcement}
			</p>
		</section>
	);
}
