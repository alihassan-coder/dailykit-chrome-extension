// The dashboard: everything about Toolbelt in one tab. Sections are addressable (#tools, #ai...), so the
// command palette and other screens can link straight to one.
import type { MemoryResponse } from '@toolbelt/core';
import { Logo, StatusDot, cn, useAccount, useSettings } from '@toolbelt/ui';
import { Brain, Database, Info, KeyRound, Palette, Settings2, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { version } from '../../shell/tools.ts';
import { AboutSection } from './AboutSection.tsx';
import { AiSection } from './AiSection.tsx';
import { AppearanceSection } from './AppearanceSection.tsx';
import { DataSection } from './DataSection.tsx';
import { GeneralSection } from './GeneralSection.tsx';
import { MemorySection } from './MemorySection.tsx';
import { ToolsSection } from './ToolsSection.tsx';
import { useApiKeys } from './shared.tsx';

// Same ids as shell/commands.ts DASHBOARD_SECTIONS.
const SECTIONS = [
	{ id: 'tools', label: 'Tools', icon: Wrench, render: () => <ToolsSection /> },
	{ id: 'appearance', label: 'Appearance', icon: Palette, render: () => <AppearanceSection /> },
	{ id: 'general', label: 'General', icon: Settings2, render: () => <GeneralSection /> },
	{ id: 'ai', label: 'AI providers', icon: KeyRound, render: () => <AiSection /> },
	{ id: 'memory', label: 'Memory', icon: Brain, render: () => <MemorySection /> },
	{ id: 'data', label: 'Data and sync', icon: Database, render: () => <DataSection /> },
	{ id: 'about', label: 'About', icon: Info, render: () => <AboutSection /> }
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; render: () => ReactNode }[];

type SectionId = (typeof SECTIONS)[number]['id'];

const readHash = (): SectionId => SECTIONS.find((s) => `#${s.id}` === location.hash)?.id ?? 'tools';

/** The open section, and every section opened so far (they stay mounted, so going back keeps their state). */
function useHashSection(): { section: SectionId; visited: ReadonlySet<SectionId> } {
	const [state, setState] = useState(() => {
		const section = readHash();
		return { section, visited: new Set([section]) as ReadonlySet<SectionId> };
	});
	useEffect(() => {
		const onHash = () =>
			setState((prev) => {
				const section = readHash();
				return { section, visited: prev.visited.has(section) ? prev.visited : new Set(prev.visited).add(section) };
			});
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, []);
	return state;
}

/** The memory count for the menu. Memory may be off (no account, locked); then no count. */
function useMemoryCount(): number | null {
	const [count, setCount] = useState<number | null>(null);
	useEffect(() => {
		let alive = true;
		(browser.runtime.sendMessage({ type: 'memory:status' }) as Promise<MemoryResponse | undefined>)
			.then((res) => alive && setCount(res?.status.state === 'ready' ? res.status.count : null))
			// Only a menu hint: the Memory section itself reports failures.
			.catch(() => alive && setCount(null));
		return () => {
			alive = false;
		};
	}, []);
	return count;
}

function useNavMeta(): Partial<Record<SectionId, ReactNode>> {
	const { settings } = useSettings();
	const keys = useApiKeys();
	const memories = useMemoryCount();
	const { account } = useAccount();
	const toolStates = Object.values(settings.tools);
	const keyCount = keys ? Object.values(keys).filter(Boolean).length : 0;
	const sync =
		account?.state === 'unlocked' ? (
			<StatusDot tone={account.syncError ? 'warn' : 'ok'} />
		) : account?.state === 'locked' ? (
			<StatusDot tone="idle" />
		) : account?.state === 'database-error' ? (
			<StatusDot tone="danger" />
		) : null;
	return {
		tools: `${toolStates.filter((t) => t.enabled).length}/${toolStates.length}`,
		ai: keyCount ? `${keyCount} ${keyCount === 1 ? 'key' : 'keys'}` : null,
		memory: memories ?? null,
		data: sync
	};
}

export default function App() {
	const { section, visited } = useHashSection();
	const meta = useNavMeta();
	const scroller = useRef<HTMLDivElement>(null);

	useEffect(() => {
		scroller.current?.scrollTo?.({ top: 0 });
	}, [section]);

	return (
		<div className="flex h-screen flex-col bg-bg text-ink md:flex-row">
			<aside className="flex shrink-0 flex-col border-line max-md:border-b md:w-[220px] md:border-r">
				<div className="flex h-12 items-center gap-2 px-4 max-md:hidden">
					<Logo size={20} />
					<span className="text-lg font-semibold">Toolbelt</span>
				</div>
				<nav
					aria-label="Dashboard"
					className="flex gap-0.5 px-2 tb-no-scrollbar max-md:overflow-x-auto max-md:py-1.5 md:flex-1 md:flex-col md:overflow-y-auto"
				>
					{SECTIONS.map(({ id, label, icon: Icon }) => (
						<a
							key={id}
							href={`#${id}`}
							aria-current={id === section ? 'page' : undefined}
							className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-base whitespace-nowrap text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-ink"
						>
							<Icon size={16} strokeWidth={1.75} aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate">{label}</span>
							{meta[id] !== null && meta[id] !== undefined && (
								<span className="ml-2 flex items-center text-xs text-faint tb-num max-md:hidden">{meta[id]}</span>
							)}
						</a>
					))}
				</nav>
				<p className="px-4 py-3 text-xs text-faint tb-num max-md:hidden">Version {version()}</p>
			</aside>
			<div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
				<main className="mx-auto max-w-[720px] min-w-0 px-4 py-6 md:px-8">
					{SECTIONS.map((s) =>
						visited.has(s.id) ? (
							<div key={s.id} hidden={s.id !== section} className={cn(s.id === section && 'tb-enter')}>
								{s.render()}
							</div>
						) : null
					)}
				</main>
			</div>
		</div>
	);
}
