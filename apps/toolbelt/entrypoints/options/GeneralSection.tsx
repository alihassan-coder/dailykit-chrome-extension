// General: how Toolbelt starts, its keyboard shortcuts, and resetting settings.
import { DEFAULT_THEME, resolveSettings, setGeneral } from '@toolbelt/core';
import { Button, ConfirmDialog, KbdGroup, Select, showError, toast, useSettings } from '@toolbelt/ui';
import { ExternalLink, History } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { icons, tools } from '../../shell/tools.ts';
import { SettingsGroup, SettingsHeader, SettingsRow } from './shared.tsx';

const SHORTCUTS: { keys: string[][]; does: string; where: string }[] = [
	{ keys: [['Mod', 'K']], does: 'Search tools, settings and actions', where: 'Side panel' },
	{ keys: [['[']], does: 'Open or collapse the toolbar', where: 'Side panel' },
	{ keys: [['↑'], ['↓']], does: 'Move between tools in the toolbar', where: 'Side panel' },
	{
		keys: [
			['Alt', '↑'],
			['Alt', '↓']
		],
		does: 'Move a tool up or down the list',
		where: 'Dashboard, Tools'
	}
];

/** The browser-wide shortcut that opens Toolbelt, if one is set. undefined while loading or not supported. */
function useBrowserShortcut(): string | null | undefined {
	const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
	useEffect(() => {
		let alive = true;
		const commands = (browser as { commands?: { getAll?: () => Promise<{ name?: string; shortcut?: string }[]> } })
			.commands;
		if (!commands?.getAll) return;
		commands
			.getAll()
			.then((all) => {
				const main = all.find((c) => c.name === '_execute_action' || c.name === '_execute_side_panel') ?? all[0];
				if (alive) setShortcut(main?.shortcut || null);
			})
			// Some browsers have no commands API in this context; the row then just offers to set one.
			.catch(() => alive && setShortcut(null));
		return () => {
			alive = false;
		};
	}, []);
	return shortcut;
}

export function GeneralSection() {
	const { settings, update } = useSettings();
	const shortcut = useBrowserShortcut();

	function openShortcuts() {
		browser.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch((e: unknown) => showError(e));
	}

	return (
		<section aria-labelledby="general-title" className="grid gap-5">
			<SettingsHeader
				id="general-title"
				title="General"
				description="How Toolbelt opens and how to drive it from the keyboard."
			/>

			<SettingsGroup title="Start">
				<SettingsRow label="Side panel opens with" hint="The tool shown when you open the side panel.">
					<Select
						label="Side panel opens with"
						className="w-56"
						value={settings.general.startTool}
						onChange={(v) => {
							update((s) => setGeneral(s, { startTool: v })).catch((e: unknown) => showError(e));
						}}
						options={[
							{
								value: 'last',
								label: 'The tool I used last',
								icon: <History size={16} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
							},
							...tools.map((t) => {
								const Icon = icons[t.id];
								return { value: t.id, label: t.name, group: 'Tools', icon: Icon ? <Icon size={16} /> : undefined };
							})
						]}
					/>
				</SettingsRow>
				<SettingsRow
					label="Open Toolbelt from anywhere"
					hint={
						shortcut === null ? 'No browser-wide shortcut set yet.' : 'A browser-wide shortcut, set in your browser.'
					}
				>
					{shortcut && <KbdGroup keys={shortcut.split('+')} />}
					<Button size="sm" icon={<ExternalLink aria-hidden="true" />} onClick={openShortcuts}>
						{shortcut ? 'Change' : 'Set a shortcut'}
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Keyboard" meta={SHORTCUTS.length}>
				{SHORTCUTS.map((s) => (
					<div key={s.does} className="flex min-h-9 items-center gap-4 px-3 py-1.5">
						<p className="min-w-0 flex-1 truncate text-base">{s.does}</p>
						<span className="text-sm text-faint max-sm:hidden">{s.where}</span>
						<span className="flex w-32 items-center justify-end gap-1 whitespace-nowrap">
							{s.keys.map((combo, i) => (
								<Fragment key={combo.join('+')}>
									{i > 0 && <span className="text-xs text-faint">or</span>}
									<KbdGroup keys={combo} />
								</Fragment>
							))}
						</span>
					</div>
				))}
			</SettingsGroup>

			<SettingsGroup title="Reset">
				<SettingsRow label="Reset settings" hint="Turns every tool and feature back on and restores the default look.">
					<ConfirmDialog
						title="Reset all settings?"
						description={
							<>
								Every tool and feature is switched back on and the default look returns. Your saved data and API keys
								are not touched.
							</>
						}
						confirmLabel="Reset settings"
						onConfirm={() => {
							update(() => resolveSettings({ theme: DEFAULT_THEME }, tools))
								.then(() => toast.success('Settings reset'))
								.catch((e: unknown) => showError(e));
						}}
						trigger={
							<Button size="sm" variant="danger-ghost">
								Reset settings…
							</Button>
						}
					/>
				</SettingsRow>
			</SettingsGroup>
		</section>
	);
}
