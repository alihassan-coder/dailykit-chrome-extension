// Everything the side panel's search can do, built from the tools that are on and the dashboard sections.
// Listed under three headings: Tools, Actions, Settings.
import { enabledToolIds, setTheme, type Settings, type SettingsStore } from '@toolbelt/core';
import type { Command } from '@toolbelt/ui';
import { browser } from 'wxt/browser';
import { keywords, tools } from './tools.ts';

export const DASHBOARD_SECTIONS = [
	{ id: 'tools', title: 'Tools', keywords: ['order', 'switch', 'features'] },
	{ id: 'appearance', title: 'Appearance', keywords: ['theme', 'accent', 'colour', 'dark mode', 'font', 'size'] },
	{ id: 'general', title: 'General', keywords: ['start', 'shortcuts', 'reset'] },
	{ id: 'ai', title: 'AI providers', keywords: ['api key', 'anthropic', 'openai', 'grok', 'gemini', 'claude', 'gpt'] },
	{ id: 'memory', title: 'Memory', keywords: ['remember', 'memories', 'agent', 'mem0', 'forget', 'recall'] },
	{ id: 'data', title: 'Data and sync', keywords: ['neon', 'backup', 'export', 'import', 'account'] },
	{ id: 'about', title: 'About', keywords: ['version', 'licence', 'credits'] }
] as const;

export const COMMAND_GROUPS = { tools: 'Tools', actions: 'Actions', settings: 'Settings' } as const;

export const openDashboard = (section?: string) => {
	browser.tabs
		.create({ url: browser.runtime.getURL(`/options.html${section ? `#${section}` : ''}`) })
		.catch((e: unknown) => console.warn('Toolbelt: could not open the dashboard', e));
};

/** What the commands do that only the side panel knows how to do. */
export interface CommandActions {
	openTool: (id: string) => void;
	/** Wide panels save the choice; narrow ones open the toolbar over the content. */
	toggleRail: () => void;
	lock: () => void;
}

export function buildCommands(settings: Settings, store: SettingsStore, actions: CommandActions): Command[] {
	const railOpen = settings.theme.rail === 'labels';
	const toolCommands: Command[] = enabledToolIds(settings).flatMap((id) => {
		const tool = tools.find((t) => t.id === id);
		if (!tool) return [];
		return [
			{
				id: `tool:${id}`,
				title: tool.name,
				keywords: keywords[id],
				group: COMMAND_GROUPS.tools,
				run: () => actions.openTool(id)
			}
		];
	});

	const mode = settings.theme.mode;
	const themeCommands: Command[] = (['light', 'dark', 'system'] as const)
		.filter((m) => m !== mode)
		.map((m) => ({
			id: `theme:${m}`,
			title: m === 'system' ? 'Follow system light and dark' : `Switch to ${m} mode`,
			keywords: ['theme', 'appearance'],
			group: COMMAND_GROUPS.actions,
			run: () => {
				store
					.update((s) => setTheme(s, { mode: m }))
					.catch((e: unknown) => console.warn('Toolbelt: could not change the theme', e));
			}
		}));

	const actionCommands: Command[] = [
		{
			id: 'layout:rail',
			title: railOpen ? 'Collapse the toolbar' : 'Open the toolbar',
			keywords: ['sidebar', 'minimise', 'expand', 'names'],
			hint: '[',
			group: COMMAND_GROUPS.actions,
			run: actions.toggleRail
		},
		...themeCommands,
		{
			id: 'action:dashboard',
			title: 'Open the dashboard',
			keywords: ['settings', 'options', 'preferences'],
			group: COMMAND_GROUPS.actions,
			run: () => openDashboard()
		},
		{
			id: 'action:lock',
			title: 'Lock Toolbelt',
			keywords: ['sign out', 'log out', 'password'],
			group: COMMAND_GROUPS.actions,
			run: actions.lock
		}
	];

	const sectionCommands: Command[] = DASHBOARD_SECTIONS.map((s) => ({
		id: `settings:${s.id}`,
		title: `${s.title} settings`,
		keywords: [...s.keywords],
		group: COMMAND_GROUPS.settings,
		run: () => openDashboard(s.id)
	}));

	return [...toolCommands, ...actionCommands, ...sectionCommands];
}
