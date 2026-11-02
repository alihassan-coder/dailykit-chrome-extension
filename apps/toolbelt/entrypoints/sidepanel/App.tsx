// The side panel: a 40 px top bar (tool, search, menu), the chosen tool at full width, and a 44 px bar at the
// bottom with the tool dock and the sync state. Keyboard: Ctrl/Cmd+K search, Alt+1..9 open a tool, arrow keys
// move inside the dock.
import { agentDraft, isFresh } from '@toolbelt/tool-agent/handoff';
import { enabledToolIds, toolValue } from '@toolbelt/core';
import { Button, EmptyState, localArea, showError, useAccount, useSettings, type Command } from '@toolbelt/ui';
import { LayoutDashboard, Lock, Monitor, Moon, Settings2, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { HeaderSearch } from '../../shell/HeaderSearch.tsx';
import { buildCommands, openDashboard } from '../../shell/commands.ts';
import { panels, settingsStore, tools } from '../../shell/tools.ts';
import { DockBar } from './Dock.tsx';
import { ToolIcon } from './ToolIcon.tsx';
import { ToolScroller } from './ToolScroller.tsx';
import { TopBar } from './TopBar.tsx';
import { usePanelWidth } from './usePanelWidth.ts';

// The last tool used, so the panel reopens where you left it (Firefox unloads the sidebar on close).
const lastTool = toolValue(localArea, 'shell', 'last-tool', (v) => (typeof v === 'string' ? v : null));

/** From this width (px) the top bar has room for a search field instead of a search button. */
const WIDE_PANEL = 520;

const COMMAND_ICONS: Record<string, LucideIcon> = {
	'theme:light': Sun,
	'theme:dark': Moon,
	'theme:system': Monitor,
	'action:dashboard': LayoutDashboard,
	'action:lock': Lock
};

function commandIcon(c: Command) {
	if (c.id.startsWith('tool:')) return <ToolIcon id={c.id.slice(5)} size={16} />;
	// A tool's own action ("do:<tool>:<action>") shows that tool's mark.
	if (c.id.startsWith('do:')) return <ToolIcon id={c.id.split(':')[1] ?? ''} size={16} />;
	const Icon = COMMAND_ICONS[c.id] ?? (c.id.startsWith('settings:') ? Settings2 : null);
	return Icon ? <Icon className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" /> : null;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

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
	// Set when something asked for a tool (the right-click menu): the last-used tool must not win over it.
	const handedOver = useRef(false);
	const width = usePanelWidth(root);

	const loadLastTool = useEffectEvent(() => {
		if (startTool !== 'last') return;
		lastTool.get().then(
			(id) => {
				if (!handedOver.current) setSelected(id ?? null);
			},
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
		lastTool.set(id).catch((e: unknown) => console.warn('Toolbelt: could not remember the last tool', e));
	}

	function lock() {
		send({ type: 'account:lock' }).catch((e: unknown) => showError(e));
	}

	// "Ask Toolbelt about ..." in the right-click menu leaves a question for the agent: open the agent for it.
	const onDraft = useEffectEvent((d: Parameters<typeof isFresh>[0]) => {
		if (!isFresh(d) || !visible.some((t) => t.id === 'agent')) return;
		handedOver.current = true;
		choose('agent');
	});
	useEffect(() => {
		agentDraft.get().then(
			(d) => onDraft(d),
			(e: unknown) => console.warn('Toolbelt: could not read a question for the agent', e)
		);
		return agentDraft.subscribe((d) => onDraft(d));
	}, []);

	const commands = buildCommands(settings, settingsStore, { openTool: choose, lock });

	// Alt+1..9 opens the tool in that place of the dock. Option+digit types a character on a Mac, so there it
	// only works outside text boxes.
	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
		const n = /^Digit([1-9])$/.exec(e.code)?.[1];
		if (!n || (isMac && isTyping(e.target))) return;
		const tool = visible[Number(n) - 1];
		if (!tool) return;
		e.preventDefault();
		choose(tool.id);
	});
	useEffect(() => {
		const listener = (e: KeyboardEvent) => onKey(e);
		window.addEventListener('keydown', listener);
		return () => window.removeEventListener('keydown', listener);
	}, []);

	return (
		<div ref={root} className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
			<HeaderSearch commands={commands} renderIcon={commandIcon}>
				<TopBar tool={active} tools={visible} wide={width >= WIDE_PANEL} onChoose={choose} onLock={lock} />
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
							body="Switch tools on in the dashboard and they appear in the dock at the bottom."
							action={
								<Button variant="primary" onClick={() => openDashboard('tools')}>
									Open the dashboard
								</Button>
							}
						/>
					</div>
				)}
			</main>

			<DockBar
				account={account}
				tools={visible}
				activeId={active?.id}
				mounted={mounted}
				onChoose={choose}
				labels={settings.theme.rail === 'labels'}
				width={width}
			/>
		</div>
	);
}
