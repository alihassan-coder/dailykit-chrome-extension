// The side panel: a 40 px top bar (tool, search, menu), the chosen tool, a 24 px status bar, and the toolbar on
// the right edge. Keyboard: Ctrl/Cmd+K search, [ opens or collapses the toolbar, arrow keys move in it.
import { enabledToolIds, toolValue } from '@toolbelt/core';
import { Button, EmptyState, localArea, showError, useAccount, useSettings, type Command } from '@toolbelt/ui';
import { LayoutDashboard, Lock, Monitor, Moon, PanelRight, Settings2, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { HeaderSearch } from '../../shell/HeaderSearch.tsx';
import { buildCommands, openDashboard } from '../../shell/commands.ts';
import { panels, settingsStore, tools } from '../../shell/tools.ts';
import { Rail, RailSheet } from './Rail.tsx';
import { StatusBar } from './StatusBar.tsx';
import { ToolIcon } from './ToolIcon.tsx';
import { ToolScroller } from './ToolScroller.tsx';
import { TopBar } from './TopBar.tsx';
import { useRailState } from './useRailState.ts';

// The last tool used, so the panel reopens where you left it (Firefox unloads the sidebar on close).
const lastTool = toolValue(localArea, 'shell', 'last-tool', (v) => (typeof v === 'string' ? v : null));

const COMMAND_ICONS: Record<string, LucideIcon> = {
	'theme:light': Sun,
	'theme:dark': Moon,
	'theme:system': Monitor,
	'layout:rail': PanelRight,
	'action:dashboard': LayoutDashboard,
	'action:lock': Lock
};

function commandIcon(c: Command) {
	if (c.id.startsWith('tool:')) return <ToolIcon id={c.id.slice(5)} size={16} />;
	const Icon = COMMAND_ICONS[c.id] ?? (c.id.startsWith('settings:') ? Settings2 : null);
	return Icon ? <Icon className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" /> : null;
}

const isTyping = (t: EventTarget | null) =>
	t instanceof HTMLInputElement ||
	t instanceof HTMLTextAreaElement ||
	t instanceof HTMLSelectElement ||
	(t instanceof HTMLElement && t.isContentEditable);

export default function App() {
	const { settings } = useSettings();
	const { account, send } = useAccount();
	const visible = enabledToolIds(settings)
		.map((id) => tools.find((t) => t.id === id))
		.filter((t) => t !== undefined);
	const startTool = settings.general.startTool;
	// undefined while "the tool I used last" is being looked up, so the wrong tool never flashes first.
	const [selected, setSelected] = useState<string | null | undefined>(startTool === 'last' ? undefined : startTool);
	// Tools opened before: they stay mounted, so a chat or half-typed text survives switching away and back.
	const [visited, setVisited] = useState<string[]>([]);
	const root = useRef<HTMLDivElement>(null);
	const rail = useRailState(root);

	const loadLastTool = useEffectEvent(() => {
		if (startTool !== 'last') return;
		lastTool.get().then(
			(id) => setSelected(id ?? null),
			(e: unknown) => {
				console.warn('Toolbelt: could not read the last tool', e);
				setSelected(null);
			}
		);
	});
	useEffect(() => loadLastTool(), []);

	const active = selected === undefined ? undefined : (visible.find((t) => t.id === selected) ?? visible[0]);
	const mounted = [...new Set([...visited, ...(active ? [active.id] : [])])].filter((id) =>
		visible.some((t) => t.id === id)
	);

	function choose(id: string) {
		setVisited((v) => [...new Set([...v, ...(active ? [active.id] : []), id])]);
		setSelected(id);
		rail.setOverlay(false);
		lastTool.set(id).catch((e: unknown) => console.warn('Toolbelt: could not remember the last tool', e));
	}

	function lock() {
		send({ type: 'account:lock' }).catch((e: unknown) => showError(e));
	}

	const commands = buildCommands(settings, settingsStore, { openTool: choose, toggleRail: rail.toggle, lock });

	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if (e.key === '[' && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			rail.toggle();
		}
	});
	useEffect(() => {
		const listener = (e: KeyboardEvent) => onKey(e);
		window.addEventListener('keydown', listener);
		return () => window.removeEventListener('keydown', listener);
	}, []);

	const railProps = { tools: visible, activeId: active?.id, mounted, onChoose: choose, onToggle: rail.toggle };

	return (
		<div ref={root} className="flex h-dvh overflow-hidden bg-bg text-ink">
			<div className="flex min-w-0 flex-1 flex-col">
				<HeaderSearch commands={commands} renderIcon={commandIcon}>
					<TopBar tool={active} wide={rail.wide} onLock={lock} />
				</HeaderSearch>

				<main className="flex min-h-0 flex-1 flex-col">
					{selected === undefined ? null : active ? (
						mounted.map((id) => {
							const Panel = panels[id];
							if (!Panel) return null;
							return (
								<ToolScroller key={id} id={id} shown={id === active.id}>
									<Panel />
								</ToolScroller>
							);
						})
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

				<StatusBar account={account} toolsOn={visible.length} />
			</div>

			<Rail {...railProps} expanded={rail.pinned} />
			<RailSheet {...railProps} open={rail.overlay} onOpenChange={rail.setOverlay} returnFocus={rail.returnFocus} />
		</div>
	);
}
