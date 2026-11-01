// browser.storage.local in the shape the core stores expect, for extension pages and content scripts.
import type { SettingsArea } from '@toolbelt/core';
import { browser } from 'wxt/browser';

type Listener = Parameters<SettingsArea['onChanged']['addListener']>[0];
const wrapped = new Map<Listener, (changes: Record<string, { newValue?: unknown }>, area: string) => void>();

export const localArea: SettingsArea = {
	get: (key) => browser.storage.local.get(key),
	set: (items) => browser.storage.local.set(items),
	onChanged: {
		addListener(listener) {
			const onlyLocal = (changes: Record<string, { newValue?: unknown }>, area: string) => {
				if (area === 'local') listener(changes, area);
			};
			wrapped.set(listener, onlyLocal);
			browser.storage.onChanged.addListener(onlyLocal);
		},
		removeListener(listener) {
			const fn = wrapped.get(listener);
			if (fn) browser.storage.onChanged.removeListener(fn);
			wrapped.delete(listener);
		}
	}
};
