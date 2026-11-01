// Black-and-white descriptor. Build-time only: imported by wxt.config.ts, never by browser code.
import { fileURLToPath } from 'node:url';
import { defineTool } from '@toolbelt/core';
import { ALL_SITES } from './sites.ts';

const entry = (file: string) => fileURLToPath(new URL(`./entries/${file}`, import.meta.url));

export const grayscale = defineTool({
	id: 'grayscale',
	name: 'Black and white',
	description: 'Turn any website black and white, with a strength you choose and sites you keep in colour',
	hostMatches: ALL_SITES,
	permissions: [],
	contentScripts: [
		{ id: 'page', entry: entry('page.content.ts'), matches: ALL_SITES, world: 'ISOLATED', runAt: 'document_start' }
	],
	features: []
});

export default grayscale;
