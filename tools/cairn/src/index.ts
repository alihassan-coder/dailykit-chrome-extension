// Cairn's descriptor. Build-time only: imported by the apps' wxt.config.ts, never by browser code.
import { fileURLToPath } from 'node:url';
import { defineTool } from '@toolbelt/core';
import { CHATGPT, CLAUDE } from './sites.ts';

const entry = (file: string) => fileURLToPath(new URL(`./entries/${file}`, import.meta.url));

export const cairn = defineTool({
	id: 'cairn',
	name: 'Cairn',
	description: 'Save private Claude and ChatGPT chats, see context and usage',
	hostMatches: [...CLAUDE, ...CHATGPT],
	permissions: ['storage', 'unlimitedStorage', 'clipboardWrite'],
	contentScripts: [
		{
			id: 'claude-main',
			entry: entry('claude-main.content.ts'),
			matches: CLAUDE,
			world: 'MAIN',
			runAt: 'document_start'
		},
		{
			id: 'claude-ui',
			entry: entry('claude-ui.content.tsx'),
			matches: CLAUDE,
			world: 'ISOLATED',
			runAt: 'document_idle'
		}
	],
	features: [
		{
			id: 'quote',
			title: 'Quote button on selected text',
			description: 'Select text, then put it in your message as a quote.',
			defaultOn: true
		},
		{
			id: 'snippets',
			title: 'Snippet codes while typing',
			description: 'Type {{code}} to swap in a saved prompt.',
			defaultOn: true
		},
		{
			id: 'long-chat-warning',
			title: 'Long-chat warning',
			description: 'A heads-up at 70% and 90% of the context window.',
			defaultOn: true
		}
	]
});

export default cairn;
