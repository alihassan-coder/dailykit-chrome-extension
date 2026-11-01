// General: how Toolbelt starts, its keyboard shortcuts, and resetting settings.
import { DEFAULT_THEME, resolveSettings, setGeneral } from '@toolbelt/core';
import { Button, Kbd, useSettings } from '@toolbelt/ui';
import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { tools } from '../../shell/tools.ts';

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
	return (
		<div className="grid gap-3 border-t border-line py-5 first:border-t-0 sm:grid-cols-[220px_1fr] sm:items-center">
			<div>
				<p className="font-medium">{label}</p>
				<p className="text-sm text-muted">{hint}</p>
			</div>
			<div>{children}</div>
		</div>
	);
}

const SHORTCUTS = [
	{ keys: ['Ctrl', 'K'], does: 'Search tools and settings (in the side panel)' },
	{ keys: ['Alt', '1…9'], does: 'Switch to a tool in the side panel' },
	{ keys: ['Alt', '↑ / ↓'], does: 'Move the focused tool in Tools' }
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
					<select
						value={settings.general.startTool}
						onChange={(e) => void update((s) => setGeneral(s, { startTool: e.target.value }))}
						aria-label="Side panel opens with"
						className="h-9 rounded-md border border-line bg-bg px-3 text-sm"
					>
						<option value="last">The tool I used last</option>
						{tools.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</Row>

				<Row label="Keyboard" hint="Shortcuts inside Toolbelt.">
					<ul className="grid gap-2">
						{SHORTCUTS.map((s) => (
							<li key={s.does} className="flex items-center gap-3 text-sm">
								<span className="flex w-28 shrink-0 gap-1">
									{s.keys.map((k) => (
										<Kbd key={k}>{k}</Kbd>
									))}
								</span>
								{s.does}
							</li>
						))}
					</ul>
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
