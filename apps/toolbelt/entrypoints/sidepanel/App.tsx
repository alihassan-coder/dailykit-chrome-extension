// The side panel: a rail of switched-on tools on the left, the chosen tool on the right.
import { enabledToolIds, toolValue } from '@toolbelt/core';
import { Button, EmptyState, IconButton, Logo, ToolMark, localArea, useSettings } from '@toolbelt/ui';
import { Settings2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { panels, tools } from '../../shell/tools.ts';

// Remember the last tool, so the panel reopens where you left it (Firefox unloads the sidebar on close).
const lastTool = toolValue(localArea, 'shell', 'last-tool', (v) => (typeof v === 'string' ? v : null));

const openDashboard = () => void browser.runtime.openOptionsPage();

export default function App() {
	const { settings } = useSettings();
	const visible = enabledToolIds(settings)
		.map((id) => tools.find((t) => t.id === id))
		.filter((t) => t !== undefined);
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		void lastTool.get().then(setSelected);
	}, []);

	const active = visible.find((t) => t.id === selected) ?? visible[0];
	const Panel = active ? panels[active.id] : undefined;

	function choose(id: string) {
		setSelected(id);
		void lastTool.set(id);
	}

	return (
		<div className="flex h-screen bg-bg text-ink">
			<nav
				aria-label="Tools"
				className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-3"
			>
				<span className="mb-2" title="Toolbelt">
					<Logo size={22} />
				</span>
				{visible.map((tool) => (
					<button
						key={tool.id}
						type="button"
						onClick={() => choose(tool.id)}
						aria-current={tool.id === active?.id ? 'page' : undefined}
						title={tool.name}
						className="rounded-md p-1 transition-colors hover:bg-soft"
					>
						<ToolMark name={tool.name} active={tool.id === active?.id} />
						<span className="sr-only">{tool.name}</span>
					</button>
				))}
				<IconButton label="Open the dashboard" onClick={openDashboard} className="mt-auto">
					<Settings2 size={18} />
				</IconButton>
			</nav>

			<main className="min-w-0 flex-1 overflow-y-auto">
				{active && Panel ? (
					<>
						<header className="sticky top-0 z-10 border-b border-line bg-bg px-4 py-3">
							<h1 className="text-lg font-semibold">{active.name}</h1>
							<p className="text-sm text-muted">{active.description}</p>
						</header>
						<div className="p-4">
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
								<Button variant="primary" onClick={openDashboard}>
									Open the dashboard
								</Button>
							}
						/>
					</div>
				)}
			</main>
		</div>
	);
}
