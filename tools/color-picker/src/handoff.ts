// "Pick a colour" from the side panel's search: the shell asks, the colour picker's panel opens the eyedropper.
// Kept in storage.session, which only Toolbelt's own pages and background can read.
import { toolValue, type SettingsArea } from '@toolbelt/core';
import { browser } from 'wxt/browser';

type Listener = Parameters<SettingsArea['onChanged']['addListener']>[0];
const wrapped = new Map<Listener, (changes: Record<string, { newValue?: unknown }>) => void>();

const sessionArea: SettingsArea = {
	get: (key) => browser.storage.session.get(key),
	set: (items) => browser.storage.session.set(items),
	onChanged: {
		addListener(listener) {
			const fn = (changes: Record<string, { newValue?: unknown }>) => listener(changes, 'session');
			wrapped.set(listener, fn);
			browser.storage.session.onChanged.addListener(fn);
		},
		removeListener(listener) {
			const fn = wrapped.get(listener);
			if (fn) browser.storage.session.onChanged.removeListener(fn);
			wrapped.delete(listener);
		}
	}
};

/** The eyedropper needs the click that asked for it; past a few seconds the request is dropped. */
export const PICK_TTL_MS = 4000;

/** When a pick was requested (ms), or null. */
export const pickRequest = toolValue(sessionArea, 'color-picker', 'pick', (v) =>
	typeof v === 'number' && Number.isFinite(v) ? v : null
);

export const requestPick = () => pickRequest.set(Date.now());
