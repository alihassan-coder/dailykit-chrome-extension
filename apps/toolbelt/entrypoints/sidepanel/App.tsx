// The side panel: search on top, the chosen tool in the middle, and a slim toolbar on the right edge that
// opens to show names. Keyboard: Ctrl/Cmd+K search, [ toggles the toolbar, arrow keys move in the toolbar.
import { enabledToolIds, setTheme, timeAgo, toolValue } from '@toolbelt/core';
import {
	Button,
	EmptyState,
	Kbd,
	Logo,
	PanelScrollProvider,
	Tooltip,
	localArea,
	useAccount,
	useSettings
} from '@toolbelt/ui';
import { Lock, PanelRightClose, PanelRightOpen, Settings2 } from 'lucide-react';
import {
	Suspense,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ButtonHTMLAttributes,
	type KeyboardEvent,
	type ReactNode,
	type Ref
} from 'react';
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

/** The sync dot on the dashboard button, so you always know your data is safe without it taking space. */
function useSyncNote(): { tone: 'ok' | 'warn'; text: string } | null {
	const { account } = useAccount();
	if (account?.state !== 'unlocked') return null;
	if (account.syncError) return { tone: 'warn', text: `Sync paused: ${account.syncError}` };
	return { tone: 'ok', text: `Synced ${timeAgo(account.lastSync)}` };
}

// Rail geometry in px, so the Density setting never blurs it: 48 px rail, 36 px items on a 40 px pitch.
const RAIL = 48;
const RAIL_OPEN = 184;
const PITCH = 40;

/** A rail row: icon always, label fading in when the rail is open. One element either way, so focus stays put. */
function RailButton({
	label,
	short,
	icon,
	expanded,
	hint,
	badge,
	className = '',
	...rest
}: {
	label: string;
	short: string;
	icon: ReactNode;
	expanded: boolean;
	hint?: string;
	badge?: ReactNode;
	className?: string;
	ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
	return (
		<Tooltip label={label} hint={hint} side="left" disabled={expanded}>
			<button
				type="button"
				aria-label={label}
				{...rest}
				className={`group relative flex h-9 w-full items-center gap-3 rounded-lg pr-2 pl-[7px] text-left transition-colors duration-100 ${className}`}
			>
				<span className="relative grid size-[22px] shrink-0 place-items-center">
					{icon}
					{badge}
				</span>
				<span
					className={`min-w-0 flex-1 truncate text-base transition-opacity duration-150 ${expanded ? 'opacity-100 delay-75' : 'opacity-0'}`}
				>
					{short}
				</span>
				{hint && (
					<span className={`transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
						<Kbd>{hint}</Kbd>
					</span>
				)}
			</button>
		</Tooltip>
	);
}

export default function App() {
	const { settings, update } = useSettings();
	const { send } = useAccount();
	const sync = useSyncNote();
	const visible = enabledToolIds(settings)
		.map((id) => tools.find((t) => t.id === id))
		.filter((t) => t !== undefined);
	const startTool = settings.general.startTool;
	// undefined while "the tool I used last" is being looked up, so the wrong tool never flashes first.
	const [selected, setSelected] = useState<string | null | undefined>(startTool === 'last' ? undefined : startTool);
	const [visited, setVisited] = useState<string[]>([]);
	const search = useRef<HTMLInputElement>(null);
	const toolButtons = useRef<(HTMLButtonElement | null)[]>([]);
	const scrollers = useRef(new Map<string, HTMLDivElement | null>());
	const [scrolled, setScrolled] = useState(false);

	// Wide panels: an open rail pushes the content and is remembered. Narrow ones: it floats over the content
	// with a scrim, closes when you pick something, and is never saved.
	const root = useRef<HTMLDivElement>(null);
	const [wide, setWide] = useState(true);
	const [overlay, setOverlay] = useState(false);
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		const measure = () => setWide(el.clientWidth >= 520);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const pinned = settings.theme.rail === 'labels';
	const expanded = wide ? pinned : overlay;

	useEffect(() => {
		if (startTool === 'last') void lastTool.get().then((id) => setSelected(id ?? null));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const active = selected === undefined ? undefined : (visible.find((t) => t.id === selected) ?? visible[0]);

	// Keep every tool you opened mounted, so a chat or half-typed text survives switching away and back.
	if (active && !visited.includes(active.id)) setVisited([...visited, active.id]);

	useLayoutEffect(() => {
		setScrolled((scrollers.current.get(active?.id ?? '')?.scrollTop ?? 0) > 0);
	}, [active?.id]);

	function choose(id: string) {
		setSelected(id);
		setOverlay(false);
		void lastTool.set(id);
	}
	const toggleRail = () => {
		if (wide) void update((s) => setTheme(s, { rail: s.theme.rail === 'labels' ? 'icons' : 'labels' }));
		else setOverlay((o) => !o);
	};

	const commands = useMemo(() => buildCommands(settings, settingsStore, choose), [settings]);

	useEffect(() => {
		function onKey(e: globalThis.KeyboardEvent) {
			const typing =
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable);
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				search.current?.focus();
			} else if (e.key === '[' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				toggleRail();
			} else if (e.key === 'Escape' && overlay) {
				setOverlay(false);
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

	const activeIndex = active ? visible.indexOf(active) : -1;

	return (
		<div ref={root} className="flex h-dvh overflow-hidden bg-bg text-ink">
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-12 shrink-0 items-center border-b border-line bg-surface px-2.5">
					<HeaderSearch
						ref={search}
						commands={commands}
						shortcut={`${isMac ? '⌘' : 'Ctrl'} K`}
						renderIcon={(c) => (c.id.startsWith('tool:') ? <ToolIcon id={c.id.slice(5)} size={18} /> : null)}
					/>
				</header>

				{selected === undefined ? null : active ? (
					visited.map((id) => {
						const tool = tools.find((t) => t.id === id);
						const Panel = panels[id];
						if (!tool || !Panel || !visible.includes(tool)) return null;
						const shown = id === active.id;
						return (
							<ToolScroller
								key={id}
								shown={shown}
								register={(el) => scrollers.current.set(id, el)}
								onScrolled={setScrolled}
							>
								<div
									className={`sticky top-0 z-20 -mx-3 flex h-12 shrink-0 items-center gap-2.5 bg-bg px-3 transition-shadow duration-150 ${
										shown && scrolled ? 'shadow-[0_1px_0_var(--tb-line),0_6px_12px_-8px_rgb(0_0_0/0.15)]' : ''
									}`}
								>
									<ToolIcon id={id} size={24} />
									<h1 className="min-w-0 truncate text-xl font-semibold tracking-tight" title={tool.name}>
										{tool.name}
									</h1>
								</div>
								<div className="tb-enter flex min-h-0 min-w-0 flex-1 flex-col">
									<Suspense fallback={<div className="min-h-40" />}>
										<Panel />
									</Suspense>
								</div>
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
			</div>

			{/* Narrow panels: the open rail floats over the content; a scrim behind it closes it. */}
			{overlay && !wide && (
				<button
					type="button"
					aria-label="Close toolbar"
					tabIndex={-1}
					onClick={() => setOverlay(false)}
					className="tb-enter fixed inset-0 z-30 bg-[rgb(0_0_0/0.22)]"
				/>
			)}

			<div className="relative shrink-0" style={{ width: wide && expanded ? RAIL_OPEN : RAIL }}>
				<nav
					aria-label="Tools"
					style={{ width: RAIL_OPEN, transform: `translateX(${expanded ? 0 : RAIL_OPEN - RAIL}px)` }}
					className={`absolute inset-y-0 right-0 z-40 flex flex-col overflow-hidden border-l border-line bg-surface transition-transform duration-200 ease-out ${
						expanded && !wide ? 'shadow-float' : ''
					}`}
				>
					<div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line pl-[11px]">
						<Logo size={26} />
						<span
							className={`text-lg font-semibold tracking-tight transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}
						>
							Toolbelt
						</span>
					</div>

					<div className="tb-no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2">
						{activeIndex >= 0 && (
							<span
								aria-hidden="true"
								style={{ transform: `translateY(${activeIndex * PITCH + 9}px)` }}
								className="absolute top-2 left-0 h-[18px] w-[3px] rounded-r-full bg-accent transition-transform duration-200 ease-out"
							/>
						)}
						<div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
							{visible.map((tool, i) => {
								const current = tool.id === active?.id;
								return (
									<RailButton
										key={tool.id}
										ref={(el) => {
											toolButtons.current[i] = el;
										}}
										role="tab"
										aria-selected={current}
										tabIndex={current ? 0 : -1}
										label={tool.name}
										short={tool.name}
										expanded={expanded}
										onClick={() => choose(tool.id)}
										onKeyDown={(e) => onToolbarKey(e, i)}
										className={current ? 'font-semibold text-ink' : 'text-ink/75 hover:bg-soft hover:text-ink'}
										icon={
											<span
												className={`grid transition-[opacity,filter,transform] duration-150 ease-out group-hover:scale-105 ${
													current ? '' : 'opacity-70 saturate-[0.7] group-hover:opacity-100 group-hover:saturate-100'
												}`}
											>
												<ToolIcon id={tool.id} size={22} />
											</span>
										}
									/>
								);
							})}
						</div>
					</div>

					<div className="flex shrink-0 flex-col gap-1 border-t border-line px-1.5 py-2">
						<RailButton
							label="Lock Toolbelt"
							short="Lock"
							icon={<Lock size={18} strokeWidth={1.75} />}
							expanded={expanded}
							className="text-muted hover:bg-soft hover:text-ink"
							onClick={() => void send({ type: 'account:lock' })}
						/>
						<RailButton
							label={sync ? `Open the dashboard · ${sync.text}` : 'Open the dashboard'}
							short="Dashboard"
							icon={<Settings2 size={18} strokeWidth={1.75} />}
							badge={
								sync && (
									<span
										aria-hidden="true"
										className={`absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-surface ${sync.tone === 'ok' ? 'bg-ok' : 'bg-warn'}`}
									/>
								)
							}
							expanded={expanded}
							className="text-muted hover:bg-soft hover:text-ink"
							onClick={() => openDashboard()}
						/>
						<RailButton
							label={expanded ? 'Collapse toolbar' : 'Open toolbar'}
							short="Collapse"
							hint="["
							icon={
								expanded ? (
									<PanelRightClose size={18} strokeWidth={1.75} />
								) : (
									<PanelRightOpen size={18} strokeWidth={1.75} />
								)
							}
							expanded={expanded}
							aria-expanded={expanded}
							className="text-muted hover:bg-soft hover:text-ink"
							onClick={toggleRail}
						/>
					</div>
				</nav>
			</div>
		</div>
	);
}

/** One tool's own scroll area. Hidden tools stay mounted; their scroll position is put back when shown. */
function ToolScroller({
	shown,
	register,
	onScrolled,
	children
}: {
	shown: boolean;
	register: (el: HTMLDivElement | null) => void;
	onScrolled: (scrolled: boolean) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const saved = useRef(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el && shown) el.scrollTop = saved.current;
	}, [shown]);
	return (
		<div
			ref={(el) => {
				ref.current = el;
				register(el);
			}}
			hidden={!shown}
			onScroll={(e) => {
				saved.current = e.currentTarget.scrollTop;
				onScrolled(saved.current > 0);
			}}
			className="@container min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
		>
			<PanelScrollProvider value={ref}>
				<div className="mx-auto flex min-h-full w-full max-w-[560px] min-w-0 flex-col px-3 pb-3">{children}</div>
			</PanelScrollProvider>
		</div>
	);
}
