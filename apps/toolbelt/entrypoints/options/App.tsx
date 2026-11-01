// The dashboard: everything about Toolbelt in one tab. Sections are addressable (#tools, #appearance).
import { Logo, useSettings } from '@toolbelt/ui';
import { Database, Info, KeyRound, Palette, Settings2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AboutSection } from './AboutSection.tsx';
import { AiSection } from './AiSection.tsx';
import { AppearanceSection } from './AppearanceSection.tsx';
import { DataSection } from './DataSection.tsx';
import { GeneralSection } from './GeneralSection.tsx';
import { ToolsSection } from './ToolsSection.tsx';

// Same ids as shell/commands.ts DASHBOARD_SECTIONS, so the command palette can link straight here.
const SECTIONS = [
	{ id: 'tools', label: 'Tools', icon: Wrench, render: () => <ToolsSection /> },
	{ id: 'appearance', label: 'Appearance', icon: Palette, render: () => <AppearanceSection /> },
	{ id: 'general', label: 'General', icon: Settings2, render: () => <GeneralSection /> },
	{ id: 'ai', label: 'AI providers', icon: KeyRound, render: () => <AiSection /> },
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
		<div className="min-h-screen bg-bg text-ink">
			<div className="mx-auto grid max-w-[1040px] gap-8 px-6 py-10 md:grid-cols-[200px_1fr]">
				<aside className="grid content-start gap-6">
					<div className="flex items-center gap-2.5">
						<Logo size={24} />
						<span className="text-lg font-semibold">Toolbelt</span>
					</div>
					<nav aria-label="Dashboard" className="grid gap-1">
						{SECTIONS.map(({ id, label, icon: Icon }) => (
							<a
								key={id}
								href={`#${id}`}
								aria-current={id === section ? 'page' : undefined}
								className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-soft hover:text-ink aria-[current=page]:bg-soft aria-[current=page]:font-medium aria-[current=page]:text-ink"
							>
								<Icon size={16} />
								{label}
							</a>
						))}
					</nav>
					<p className="text-xs text-muted tabular-nums">
						{onCount} of {Object.keys(settings.tools).length} tools on
					</p>
				</aside>
				<main className="min-w-0">{current.render()}</main>
			</div>
		</div>
	);
}
