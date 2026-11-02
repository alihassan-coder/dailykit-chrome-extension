// What other parts of Toolbelt may ask of black and white (the side panel's search, the keyboard shortcut in
// the background): flip it for the site in a tab. Works on the same saved state the panel and page script use.
import { toolValue } from '@toolbelt/core';
import { localArea } from '@toolbelt/ui/storage';
import { STATE_KEY, hostOf, resolveState, toggleSite, type ToggleResult } from './grayscale.ts';

export const grayscaleState = toolValue(localArea, 'grayscale', STATE_KEY, resolveState);

/** The manifest command (keyboard shortcut) that toggles the current site. */
export const TOGGLE_COMMAND = 'toggle-grayscale';

/** Flips black and white for the site at `url`. Null for browser pages, where it never applies. */
export async function toggleForUrl(url: string | undefined): Promise<{ site: string; result: ToggleResult } | null> {
	const site = hostOf(url);
	if (!site) return null;
	let result: ToggleResult = 'on';
	await grayscaleState.update((s) => {
		const next = toggleSite(s, site);
		result = next.result;
		return next.state;
	});
	return { site, result };
}

/** A short line saying what just happened, for a toast. */
export function toggleMessage(site: string, result: ToggleResult): string {
	if (result === 'on') return `Black and white is on · ${site}`;
	if (result === 'kept-in-colour') return `${site} is kept in colour`;
	return `${site} is black and white again`;
}
