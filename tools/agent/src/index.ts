// Browser agent descriptor. Build-time only: imported by wxt.config.ts, never by browser code.
import { fileURLToPath } from 'node:url';
import { defineTool } from '@toolbelt/core';
import { ALL_SITES } from './sites.ts';

const entry = (file: string) => fileURLToPath(new URL(`./entries/${file}`, import.meta.url));

export const agent = defineTool({
	id: 'agent',
	name: 'Browser agent',
	description: 'Ask about any page or give it a task; it reads the page and acts only with your approval',
	hostMatches: ALL_SITES,
	permissions: [],
	contentScripts: [
		{ id: 'page', entry: entry('page.content.ts'), matches: ALL_SITES, world: 'ISOLATED', runAt: 'document_idle' }
	],
	features: [
		{
			id: 'screenshots',
			title: 'Let the agent take screenshots',
			description: 'Only of the tab it works on, only when it asks, sent to your chosen AI provider.',
			defaultOn: true
		}
	]
});

export default agent;
