// Profile lens descriptor. Build-time only: imported by wxt.config.ts, never by browser code.
import { defineTool } from '@toolbelt/core';
import { LINKEDIN_SITES } from './sites.ts';

export const profileLens = defineTool({
	id: 'profile-lens',
	name: 'Profile lens',
	description: 'Reads the LinkedIn profile you are viewing and answers your ICP questions about it with AI',
	hostMatches: LINKEDIN_SITES,
	// Pages are read with scripting.executeScript when you click Analyze; nothing runs on LinkedIn otherwise.
	permissions: ['scripting'],
	contentScripts: [],
	features: [
		{
			id: 'posts',
			title: 'Read recent posts',
			description: 'Also opens the activity page to read their latest posts. Takes a few seconds longer.',
			defaultOn: true
		}
	]
});

export default profileLens;
