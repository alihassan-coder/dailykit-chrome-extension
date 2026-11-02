// Everything the side panel's search can do, built from the tools that are on and the dashboard sections.
// Listed under three headings: Tools, Actions, Settings.
import { askAgent } from '@toolbelt/tool-agent/handoff';
import { requestPick } from '@toolbelt/tool-color-picker/handoff';
import { toggleForUrl, toggleMessage } from '@toolbelt/tool-grayscale/actions';
import { appError, enabledToolIds, setTheme, type Settings, type SettingsStore } from '@toolbelt/core';
import { showError, toast, type Command } from '@toolbelt/ui';
import { browser } from 'wxt/browser';
import { keywords, tools } from './tools.ts';

export const DASHBOARD_SECTIONS = [
	{ id: 'tools', title: 'Tools', keywords: ['order', 'switch', 'features'] },
	{ id: 'appearance', title: 'Appearance', keywords: ['theme', 'accent', 'colour', 'dark mode', 'font', 'size'] },
	{ id: 'general', title: 'General', keywords: ['start', 'shortcuts', 'reset'] },
	{
		id: 'ai',
		title: 'AI providers',
		keywords: ['api key', 'anthropic', 'openai', 'grok', 'gemini', 'groq', 'claude', 'gpt']
	},
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

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/** The key that opens the tool at `index` (0-based) in the dock, as text ("Alt 1", "⌥ 1"); the first nine have one. */
export const toolShortcut = (index: number): string | undefined =>
	index < 9 ? `${isMac ? '⌥' : 'Alt'} ${index + 1}` : undefined;

/** What the commands do that only the side panel knows how to do. */
export interface CommandActions {
	openTool: (id: string) => void;
	lock: () => void;
}

/** Black and white on or off for the site in the active tab, with a toast saying which. */
export async function toggleGrayscaleHere(): Promise<void> {
	try {
		const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
		const done = await toggleForUrl(tab?.url);
		if (!done) {
			showError(
				appError(
					'restricted_page',
					{},
					{
						title: 'Not on this page',
						message: 'Black and white works on websites, not on browser pages like this one.',
						severity: 'warn'
					}
				)
			);
			return;
		}
		toast.success(toggleMessage(done.site, done.result));
	} catch (error) {
		showError(error);
	}
}

/**
 * Things the tools do, offered in search when the tool is on. Tools never import each other: the shell asks
 * through each tool's own hand-over module (a value in storage the tool's panel listens to).
 */
function toolActionCommands(on: Set<string>, actions: CommandActions): Command[] {
	const list: Command[] = [];
	if (on.has('agent'))
		list.push({
			id: 'do:agent:summarise',
			title: 'Summarise this page',
			keywords: ['agent', 'ai', 'summary', 'summarize', 'tldr', 'read'],
			group: COMMAND_GROUPS.actions,
			run: () => {
				actions.openTool('agent');
				askAgent({ text: 'Summarise this page.', send: true }).catch((e: unknown) => void showError(e));
			}
		});
	if (on.has('color-picker'))
		list.push({
			id: 'do:color-picker:pick',
			title: 'Pick a colour from the screen',
			keywords: ['eyedropper', 'color', 'colour', 'hex', 'pick'],
			group: COMMAND_GROUPS.actions,
			run: () => {
				actions.openTool('color-picker');
				requestPick().catch((e: unknown) => void showError(e));
			}
		});
	if (on.has('grayscale'))
		list.push({
			id: 'do:grayscale:toggle-site',
			title: 'Toggle black and white on this site',
			keywords: ['grayscale', 'greyscale', 'monochrome', 'colour', 'focus'],
			group: COMMAND_GROUPS.actions,
			run: () => void toggleGrayscaleHere()
		});
	return list;
}

export function buildCommands(settings: Settings, store: SettingsStore, actions: CommandActions): Command[] {
	const toolCommands: Command[] = enabledToolIds(settings)
		.flatMap((id) => tools.filter((t) => t.id === id))
		.map((tool, i) => ({
			id: `tool:${tool.id}`,
			title: tool.name,
			keywords: keywords[tool.id],
			hint: toolShortcut(i),
			group: COMMAND_GROUPS.tools,
			run: () => actions.openTool(tool.id)
		}));

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
		...toolActionCommands(new Set(enabledToolIds(settings)), actions),
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
