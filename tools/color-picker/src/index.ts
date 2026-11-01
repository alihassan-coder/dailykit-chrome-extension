// Colour picker descriptor. Build-time only: imported by wxt.config.ts, never by browser code.
import { defineTool } from '@toolbelt/core';

export const colorPicker = defineTool({
	id: 'color-picker',
	name: 'Colour picker',
	description: 'Pick any colour on screen, copy it as HEX, RGB or HSL, and check text contrast',
	hostMatches: [],
	permissions: [],
	contentScripts: [],
	features: [
		{
			id: 'history',
			title: 'Keep a history of picked colours',
			description: 'The last 24 colours, saved on this device.',
			defaultOn: true
		}
	]
});

export default colorPicker;
