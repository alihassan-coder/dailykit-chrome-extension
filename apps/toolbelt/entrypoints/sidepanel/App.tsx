// The side panel: search on top, the chosen tool in the middle, and a slim toolbar on the right edge that
// opens to show names. Keyboard: Ctrl/Cmd+K search, [ toggles the toolbar, arrow keys move in the toolbar.
import { enabledToolIds, setTheme, timeAgo, toolValue } from '@toolbelt/core';
import { Button, EmptyState, IconButton, Logo, Tooltip, localArea, useAccount, useSettings } from '@toolbelt/ui';
import { Lock, PanelRightClose, PanelRightOpen, Settings2 } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { HeaderSearch } from '../../shell/HeaderSearch.tsx';
import { buildCommands, openDashboard } from '../../shell/commands.ts';
import { icons, panels, settingsStore, tools } from '../../shell/tools.ts';

// The last tool used, so the panel reopens where you left it (Firefox unloads the sidebar on close).
const lastTool = toolValue(localArea, 'shell', 'last-tool', (v) => (typeof v === 'string' ? v : null));
const isMac = navigator.platform.toLowerCase().includes('mac');

function ToolIcon({ id, size = 20 }: { id: string; size?: number }) {
	const Icon = icons[id];
	return Icon ? <Icon size={size} /> : null;
}

/** One quiet line of sync status, so you always know your data is safe. */
function SyncStatus() {
	const { account } = useAccount();
	if (account?.state !== 'unlocked') return null;
	const paused = account.syncError;
	return (
		<button
			type="button"
			onClick={() => openDashboard('data')}
			title={paused ?? 'Data and sync'}
			className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
		>
			<span className={`size-1.5 rounded-full ${paused ? 'bg-warn' : 'bg-ok'}`} aria-hidden="true" />
			{paused ? 'Sync paused' : `Synced ${timeAgo(account.lastSync)}`}
		</button>
	);
}

/** A toolbar action at the bottom: an icon when collapsed (with a tooltip), icon and label when open. */
function RailAction({
	label,
	short,
	icon,
	expanded,
	onClick,
	hint,
	ariaExpanded
}: {
	label: string;
	short: string;
	icon: ReactNode;
	expanded: boolean;
	onClick: () => void;
	hint?: string;
	ariaExpanded?: boolean;
}) {
	return (
		<Tooltip label={label} hint={hint} side="left" disabled={expanded}>
			<IconButton
				label={label}
				aria-expanded={ariaExpanded}
				onClick={onClick}
				className={expanded ? 'w-full justify-start gap-2.5 px-2' : ''}
			>
				{icon}
				{expanded && <span className="text-base">{short}</span>}
			</IconButton>
		</Tooltip>
	);
}

export default function App() {
	const { settings, update } = useSettings();
	const { send } = useAccount();
	const expanded = settings.theme.rail === 'labels';
	const visible = enabledToolIds(settings)
		.map((id) => tools.find((t) => t.id === id))
		.filter((t) => t !== undefined);
	const startTool = settings.general.startTool;
	const [selected, setSelected] = useState<string | null>(startTool === 'last' ? null : startTool);
	const search = useRef<HTMLInputElement>(null);
	const toolButtons = useRef<(HTMLButtonElement | null)[]>([]);

	useEffect(() => {
		// "The tool I used last": look it up once; changing the setting later should not yank the panel away.
		if (startTool === 'last') void lastTool.get().then(setSelected);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const active = visible.find((t) => t.id === selected) ?? visible[0];
	const Panel = active ? panels[active.id] : undefined;

	function choose(id: string) {
		setSelected(id);
		void lastTool.set(id);
	}
	const toggleRail = () => void update((s) => setTheme(s, { rail: s.theme.rail === 'labels' ? 'icons' : 'labels' }));

	const commands = useMemo(() => buildCommands(settings, settingsStore, choose), [settings]);

	useEffect(() => {
		function onKey(e: globalThis.KeyboardEvent) {
			const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				search.current?.focus();
			} else if (e.key === '[' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				toggleRail();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// The toolbar is a vertical tab list: arrows move focus, Home/End jump, Enter or Space opens.
	function onToolbarKey(e: KeyboardEvent, index: number) {
		const keys: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: visible.length - 1 };
		if (!(e.key in keys)) return;
		e.preventDefault();
		toolButtons.current[(keys[e.key]! + visible.length) % visible.length]?.focus();
	}

	return (
		<div className="@container flex h-screen bg-bg text-ink">
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
					<HeaderSearch
						ref={search}
						commands={commands}
						shortcut={`${isMac ? '⌘' : 'Ctrl'} K`}
						renderIcon={(c) =>
							c.id.startsWith('tool:') ? (
								<span className="text-muted">
									<ToolIcon id={c.id.slice(5)} size={16} />
								</span>
							) : null
						}
					/>
				</header>

				<main className="min-h-0 flex-1 overflow-y-auto">
					{active && Panel ? (
						<div key={active.id} className="tb-enter mx-auto grid max-w-[560px] gap-3 p-3">
							<div className="flex items-baseline justify-between gap-2">
								<h1 className="text-lg font-semibold">{active.name}</h1>
								<SyncStatus />
							</div>
							<Suspense fallback={null}>
								<Panel />
							</Suspense>
						</div>
					) : (
						<div className="p-3">
							<EmptyState
								title="No tools are switched on"
								body="Switch tools on in the dashboard and they appear in the toolbar on the right."
								action={
									<Button variant="primary" onClick={() => openDashboard('tools')}>
										Open the dashboard
									</Button>
								}
							/>
						</div>
					)}
				</main>
			</div>

			{/* Below 480 px an opened toolbar floats over the content; from 480 px up it pushes the content aside. */}
			<div className={`relative shrink-0 ${expanded ? 'w-12 @[480px]:w-46' : 'w-12'}`}>
				<nav
					aria-label="Tools"
					className={`absolute inset-y-0 right-0 z-30 flex flex-col gap-1 border-l border-line bg-surface py-2 transition-[width] duration-150 ${
						expanded ? 'w-46 px-2 shadow-float @[480px]:shadow-none' : 'w-12 items-center'
					}`}
				>
					<div className={`mb-2 flex h-9 items-center gap-2 ${expanded ? 'px-1.5' : 'justify-center'}`}>
						<Logo size={expanded ? 24 : 22} />
						{expanded && <span className="text-base font-semibold">Toolbelt</span>}
					</div>
					<div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
						{visible.map((tool, i) => {
							const current = tool.id === active?.id;
							return (
								<Tooltip key={tool.id} label={tool.name} side="left" disabled={expanded}>
									<button
										ref={(el) => {
											toolButtons.current[i] = el;
										}}
										type="button"
										role="tab"
										aria-selected={current}
										aria-label={tool.name}
										tabIndex={current ? 0 : -1}
										onClick={() => choose(tool.id)}
										onKeyDown={(e) => onToolbarKey(e, i)}
										className={`relative flex h-9 items-center gap-2.5 rounded-lg transition-colors ${
											expanded ? 'w-full px-2' : 'w-9 justify-center'
										} ${current ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-soft hover:text-ink'}`}
									>
										<ToolIcon id={tool.id} size={20} />
										{expanded && <span className="truncate text-base">{tool.name}</span>}
										{current && (
											<span
												aria-hidden="true"
												className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-full bg-accent"
											/>
										)}
									</button>
								</Tooltip>
							);
						})}
					</div>

					<div className={`mt-auto flex flex-col gap-1 ${expanded ? '' : 'items-center'}`}>
						<RailAction
							label="Lock Toolbelt"
							short="Lock"
							icon={<Lock size={18} />}
							expanded={expanded}
							onClick={() => void send({ type: 'account:lock' })}
						/>
						<RailAction
							label="Open the dashboard"
							short="Dashboard"
							icon={<Settings2 size={18} />}
							expanded={expanded}
							onClick={() => openDashboard()}
						/>
						<RailAction
							label={expanded ? 'Collapse toolbar' : 'Open toolbar'}
							short="Collapse"
							hint="["
							icon={expanded ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
							expanded={expanded}
							ariaExpanded={expanded}
							onClick={toggleRail}
						/>
					</div>
				</nav>
			</div>
		</div>
	);
}
