// The dashboard: everything about Toolbelt in one tab. Sections are addressable (#tools, #appearance).
import { Logo, useSettings } from '@toolbelt/ui';
import { Brain, Database, Info, KeyRound, Palette, Settings2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AboutSection } from './AboutSection.tsx';
import { AiSection } from './AiSection.tsx';
import { AppearanceSection } from './AppearanceSection.tsx';
import { DataSection } from './DataSection.tsx';
import { GeneralSection } from './GeneralSection.tsx';
import { MemorySection } from './MemorySection.tsx';
import { ToolsSection } from './ToolsSection.tsx';

// Same ids as shell/commands.ts DASHBOARD_SECTIONS, so the command palette can link straight here.
const SECTIONS = [
	{ id: 'tools', label: 'Tools', icon: Wrench, render: () => <ToolsSection /> },
	{ id: 'appearance', label: 'Appearance', icon: Palette, render: () => <AppearanceSection /> },
	{ id: 'general', label: 'General', icon: Settings2, render: () => <GeneralSection /> },
	{ id: 'ai', label: 'AI providers', icon: KeyRound, render: () => <AiSection /> },
	{ id: 'memory', label: 'Memory', icon: Brain, render: () => <MemorySection /> },
	{ id: 'data', label: 'Data and sync', icon: Database, render: () => <DataSection /> },
	{ id: 'about', label: 'About', icon: Info, render: () => <AboutSection /> }
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function useHashSection(): SectionId {
	const read = (): SectionId => (SECTIONS.find((s) => `#${s.id}` === location.hash)?.id ?? 'tools') as SectionId;
	const [section, setSection] = useState(read);
	useEffect(() => {
		const onHash = () => setSection(read());
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, []);
	return section;
}

export default function App() {
	const section = useHashSection();
	const { settings } = useSettings();
	const onCount = Object.values(settings.tools).filter((t) => t.enabled).length;
	const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

	return (
		// Only the settings column scrolls; the menu on the left stays put (it moves to the top on narrow windows).
		<div className="flex h-screen flex-col bg-bg text-ink md:flex-row">
			<aside className="flex shrink-0 flex-col gap-6 border-line px-4 py-4 max-md:border-b md:w-60 md:overflow-y-auto md:border-r md:px-4 md:py-8">
				<div className="flex items-center gap-2.5 px-3">
					<Logo size={28} />
					<span className="text-lg font-semibold">Toolbelt</span>
				</div>
				<nav aria-label="Dashboard" className="flex gap-1 max-md:overflow-x-auto md:flex-col">
					{SECTIONS.map(({ id, label, icon: Icon }) => (
						<a
							key={id}
							href={`#${id}`}
							aria-current={id === section ? 'page' : undefined}
							className="flex shrink-0 items-center gap-3 rounded-full px-3 py-2 text-base whitespace-nowrap text-muted transition-colors hover:bg-soft hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent"
						>
							<Icon size={18} />
							{label}
						</a>
					))}
				</nav>
				<p className="mt-auto px-3 text-xs text-muted tabular-nums max-md:hidden">
					{onCount} of {Object.keys(settings.tools).length} tools on
				</p>
			</aside>
			<div key={section} className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-[760px] px-6 py-8 md:py-10">
					<main className="min-w-0">{current.render()}</main>
				</div>
			</div>
		</div>
	);
}
