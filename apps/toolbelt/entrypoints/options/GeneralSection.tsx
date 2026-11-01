// General: how Toolbelt starts, its keyboard shortcuts, and resetting settings.
import { DEFAULT_THEME, resolveSettings, setGeneral } from '@toolbelt/core';
import { Button, Kbd, Select, useSettings } from '@toolbelt/ui';
import { History } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { icons, tools } from '../../shell/tools.ts';

function Row({ label, hint, children, top }: { label: string; hint: string; children: ReactNode; top?: boolean }) {
	return (
		<div
			className={`grid gap-3 border-t border-line py-5 first:border-t-0 sm:grid-cols-[240px_1fr] sm:gap-8 ${top ? 'sm:items-start' : 'sm:items-center'}`}
		>
			<div className="grid gap-0.5">
				<p className="text-base font-medium">{label}</p>
				<p className="text-sm text-muted">{hint}</p>
			</div>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

const SHORTCUTS = [
	{ keys: [['Ctrl', 'K']], does: 'Search tools, settings and actions', where: 'Side panel' },
	{ keys: [['[']], does: 'Open or collapse the toolbar', where: 'Side panel' },
	{ keys: [['↑'], ['↓']], does: 'Move between tools in the toolbar', where: 'Side panel' },
	{
		keys: [
			['Alt', '↑'],
			['Alt', '↓']
		],
		does: 'Move a tool up or down the list',
		where: 'Dashboard → Tools'
	}
];

export function GeneralSection() {
	const { settings, update } = useSettings();
	const [confirming, setConfirming] = useState(false);

	return (
		<section aria-labelledby="general-title" className="grid gap-4">
			<div>
				<h2 id="general-title" className="text-xl font-semibold">
					General
				</h2>
				<p className="text-sm text-muted">How Toolbelt opens and how to drive it from the keyboard.</p>
			</div>

			<div className="rounded-lg border border-line bg-surface px-5">
				<Row label="Side panel opens with" hint="The tool shown when you open the side panel.">
					<Select
						label="Side panel opens with"
						value={settings.general.startTool}
						onChange={(v) => void update((s) => setGeneral(s, { startTool: v }))}
						options={[
							{ value: 'last', label: 'The tool I used last', icon: <History size={18} className="text-muted" /> },
							...tools.map((t) => {
								const Icon = icons[t.id];
								return { value: t.id, label: t.name, icon: Icon ? <Icon size={20} /> : undefined };
							})
						]}
					/>
				</Row>

				<Row label="Keyboard" hint="Shortcuts inside Toolbelt." top>
					<table className="w-full text-sm">
						<tbody>
							{SHORTCUTS.map((s) => (
								<tr key={s.does} className="border-t border-line first:border-t-0">
									<td className="py-2 pr-4">
										<p className="text-ink">{s.does}</p>
										<p className="text-xs text-muted">{s.where}</p>
									</td>
									<td className="py-2 text-right whitespace-nowrap">
										{s.keys.map((combo, i) => (
											<span key={i} className="inline-flex items-center gap-1">
												{i > 0 && <span className="px-1 text-xs text-muted">or</span>}
												{combo.map((k) => (
													<Kbd key={k}>{k}</Kbd>
												))}
											</span>
										))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Row>

				<Row label="Open the side panel from anywhere" hint="Set a browser-wide shortcut for Toolbelt.">
					<Button onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
						Set a shortcut
					</Button>
				</Row>

				<Row label="Reset settings" hint="Turns every tool and feature back on and restores the default look.">
					{confirming ? (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="primary"
								onClick={async () => {
									await update(() => resolveSettings({ theme: DEFAULT_THEME }, tools));
									setConfirming(false);
								}}
							>
								Reset settings
							</Button>
							<Button variant="quiet" onClick={() => setConfirming(false)}>
								Keep my settings
							</Button>
							<span className="text-sm text-muted">Your saved data and API keys are not touched.</span>
						</div>
					) : (
						<Button onClick={() => setConfirming(true)}>Reset settings…</Button>
					)}
				</Row>
			</div>
		</section>
	);
}
