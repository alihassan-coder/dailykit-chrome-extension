// The side panel: a rail of switched-on tools, the chosen tool, and a status line.
// Keyboard: Alt+1…9 switches tools, Ctrl/Cmd+K opens the command palette.
import { enabledToolIds, timeAgo, toolValue } from '@toolbelt/core';
import {
	Button,
	CommandPalette,
	EmptyState,
	IconButton,
	Kbd,
	localArea,
	Logo,
	ToolMark,
	useAccount,
	useSettings
} from '@toolbelt/ui';
import { Search, Settings2 } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { buildCommands, openDashboard } from '../../shell/commands.ts';
import { icons, panels, settingsStore, tools, version } from '../../shell/tools.ts';

// The last tool used, so the panel reopens where you left it (Firefox unloads the sidebar on close).
const lastTool = toolValue(localArea, 'shell', 'last-tool', (v) => (typeof v === 'string' ? v : null));
const isMac = navigator.platform.toLowerCase().includes('mac');

function ToolIcon({ id, size }: { id: string; size?: number }) {
	const Icon = icons[id];
	return Icon ? <Icon size={size} /> : null;
}

/** One line of sync status, so you always know your data is safe. */
function SyncStatus() {
	const { account } = useAccount();
	const synced = account?.state === 'unlocked';
	const paused = synced && account.syncError;
	return (
		<button
			type="button"
			onClick={() => openDashboard('data')}
			title={paused ? account.syncError! : 'Data and sync'}
			className="flex items-center gap-1.5 hover:text-ink"
		>
			<span className={`size-1.5 rounded-full ${paused ? 'bg-warn' : 'bg-ok'}`} aria-hidden="true" />
			{!synced
				? 'Saved on this device'
				: paused
					? 'Sync paused, saved on this device'
					: `Synced ${timeAgo(account.lastSync)}`}
		</button>
	);
}

export default function App() {
	const { settings } = useSettings();
	const labels = settings.theme.rail === 'labels';
	const visible = enabledToolIds(settings)
		.map((id) => tools.find((t) => t.id === id))
		.filter((t) => t !== undefined);
	const startTool = settings.general.startTool;
	const [selected, setSelected] = useState<string | null>(startTool === 'last' ? null : startTool);
	const [paletteOpen, setPaletteOpen] = useState(false);

	useEffect(() => {
		// Opening with "the tool I used last": look it up once. Changing the setting later should not yank the
		// panel away from the tool on screen, so this runs on first open only.
		if (startTool === 'last') void lastTool.get().then(setSelected);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const active = visible.find((t) => t.id === selected) ?? visible[0];
	const Panel = active ? panels[active.id] : undefined;

	function choose(id: string) {
		setSelected(id);
		void lastTool.set(id);
	}

	const commands = useMemo(() => buildCommands(settings, settingsStore, choose), [settings]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setPaletteOpen((o) => !o);
			} else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
				const tool = visible[Number(e.code.slice(5)) - 1];
				if (tool) {
					e.preventDefault();
					choose(tool.id);
				}
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [visible]);

	return (
		<div className="flex h-screen bg-bg text-ink">
			<nav
				aria-label="Tools"
				className={`flex shrink-0 flex-col gap-1 border-r border-line bg-surface py-3 ${labels ? 'w-44 px-2' : 'w-14 items-center'}`}
			>
				<div className={`mb-3 flex items-center gap-2 ${labels ? 'px-2' : ''}`} title="Toolbelt">
					<Logo size={22} />
					{labels && <span className="font-semibold">Toolbelt</span>}
				</div>
				{visible.map((tool, i) => {
					const current = tool.id === active?.id;
					return (
						<button
							key={tool.id}
							type="button"
							onClick={() => choose(tool.id)}
							aria-current={current ? 'page' : undefined}
							title={`${tool.name} (Alt ${i + 1})`}
							className={`group relative flex items-center gap-2.5 rounded-md p-1 text-left transition-colors hover:bg-soft ${labels ? 'w-full pr-2' : ''}`}
						>
							<span
								aria-hidden="true"
								className={`absolute top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent transition-opacity ${labels ? '-left-2' : '-left-2.5'} ${current ? 'opacity-100' : 'opacity-0'}`}
							/>
							<ToolMark name={tool.name} icon={<ToolIcon id={tool.id} size={18} />} active={current} />
							{labels ? (
								<span className={`truncate text-sm ${current ? 'font-semibold' : 'text-muted group-hover:text-ink'}`}>
									{tool.name}
								</span>
							) : (
								<span className="sr-only">{tool.name}</span>
							)}
						</button>
					);
				})}
				<div className={`mt-auto flex flex-col gap-1 ${labels ? '' : 'items-center'}`}>
					<IconButton label="Search tools and settings (Ctrl K)" onClick={() => setPaletteOpen(true)}>
						<Search size={18} />
					</IconButton>
					<IconButton label="Open the dashboard" onClick={() => openDashboard()}>
						<Settings2 size={18} />
					</IconButton>
				</div>
			</nav>

			<div className="flex min-w-0 flex-1 flex-col">
				<main className="min-h-0 flex-1 overflow-y-auto">
					{active && Panel ? (
						<>
							<header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg px-4 py-3">
								<ToolMark name={active.name} icon={<ToolIcon id={active.id} size={20} />} size="lg" />
								<div className="min-w-0 flex-1">
									<h1 className="truncate text-lg font-semibold">{active.name}</h1>
									<p className="truncate text-sm text-muted">{active.description}</p>
								</div>
							</header>
							<div key={active.id} className="tb-enter p-4">
								<Suspense fallback={null}>
									<Panel />
								</Suspense>
							</div>
						</>
					) : (
						<div className="p-4">
							<EmptyState
								title="No tools are switched on"
								body="Switch tools on in the dashboard and they appear here."
								action={
									<Button variant="primary" onClick={() => openDashboard('tools')}>
										Open the dashboard
									</Button>
								}
							/>
						</div>
					)}
				</main>
				<footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
					<SyncStatus />
					<span className="flex items-center gap-2">
						<Kbd>{isMac ? '⌘' : 'Ctrl'} K</Kbd>
						<span className="tabular-nums">v{version()}</span>
					</span>
				</footer>
			</div>

			<CommandPalette
				open={paletteOpen}
				onClose={() => setPaletteOpen(false)}
				commands={commands}
				renderIcon={(c) =>
					c.id.startsWith('tool:') ? (
						<ToolMark name={c.title} icon={<ToolIcon id={c.id.slice(5)} size={14} />} size="sm" />
					) : null
				}
			/>
		</div>
	);
}
