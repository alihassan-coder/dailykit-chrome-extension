// Everything the command palette can do, built from the tools that are on and the dashboard sections.
import { enabledToolIds, setTheme, type Settings, type SettingsStore } from '@toolbelt/core';
import type { Command } from '@toolbelt/ui';
import { browser } from 'wxt/browser';
import { keywords, tools } from './tools.ts';

export const DASHBOARD_SECTIONS = [
	{ id: 'tools', title: 'Tools', keywords: ['order', 'switch', 'features'] },
	{ id: 'appearance', title: 'Appearance', keywords: ['theme', 'accent', 'colour', 'dark mode', 'font', 'size'] },
	{ id: 'general', title: 'General', keywords: ['start', 'shortcuts', 'reset'] },
	{ id: 'ai', title: 'AI providers', keywords: ['api key', 'anthropic', 'openai', 'grok', 'gemini', 'claude', 'gpt'] },
	{ id: 'data', title: 'Data and sync', keywords: ['neon', 'backup', 'export', 'import', 'account'] },
	{ id: 'about', title: 'About', keywords: ['version', 'licence', 'credits'] }
] as const;

export const openDashboard = (section?: string) =>
	void browser.tabs.create({ url: browser.runtime.getURL(`/options.html${section ? `#${section}` : ''}`) });

export function buildCommands(settings: Settings, store: SettingsStore, openTool: (id: string) => void): Command[] {
	const railOpen = settings.theme.rail === 'labels';
	const toolCommands: Command[] = enabledToolIds(settings).flatMap((id) => {
		const tool = tools.find((t) => t.id === id);
		if (!tool) return [];
		return [
			{
				id: `tool:${id}`,
				title: tool.name,
				keywords: keywords[id],
				hint: 'Tool',
				run: () => openTool(id)
			}
		];
	});

	const sectionCommands: Command[] = DASHBOARD_SECTIONS.map((s) => ({
		id: `settings:${s.id}`,
		title: `${s.title} settings`,
		keywords: [...s.keywords],
		hint: 'Dashboard',
		run: () => openDashboard(s.id)
	}));

	const mode = settings.theme.mode;
	const themeCommands: Command[] = (['light', 'dark', 'system'] as const)
		.filter((m) => m !== mode)
		.map((m) => ({
			id: `theme:${m}`,
			title: m === 'system' ? 'Follow system light and dark' : `Switch to ${m} mode`,
			keywords: ['theme', 'appearance'],
			hint: 'Theme',
			run: () => void store.update((s) => setTheme(s, { mode: m }))
		}));

	const layoutCommands: Command[] = [
		{
			id: 'layout:rail',
			title: railOpen ? 'Collapse the toolbar' : 'Open the toolbar',
			keywords: ['sidebar', 'minimise', 'expand', 'names'],
			hint: '[',
			run: () => void store.update((s) => setTheme(s, { rail: railOpen ? 'icons' : 'labels' }))
		}
	];

	return [...toolCommands, ...sectionCommands, ...themeCommands, ...layoutCommands];
}
