/// <reference types="@toolbelt/wxt-kit/registry" />
import { createSettingsStore, enabledToolIds, isAccountRequest, syncToolScripts, type Settings } from '@toolbelt/core';
import { createAccountService, neonSql } from '@toolbelt/db';
import { localArea } from '@toolbelt/ui/storage';
import registry from 'virtual:toolbelt/registry';
import { browser } from 'wxt/browser';

const settings = createSettingsStore(localArea, registry.tools);

function syncScripts(s?: Settings) {
	return (s ? Promise.resolve(s) : settings.get()).then((current) =>
		syncToolScripts({
			tools: registry.tools,
			enabled: enabledToolIds(current),
			hasAccess: (origins) => (origins.length ? browser.permissions.contains({ origins }) : Promise.resolve(true)),
			scripting: browser.scripting
		})
	);
}

// The toolbar button opens the side panel: Chrome has a setting for it, Firefox needs a click handler.
function openPanelOnToolbarClick() {
	if (browser.sidePanel?.setPanelBehavior) {
		void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
		return;
	}
	const sidebar = (browser as unknown as { sidebarAction?: { toggle(): Promise<void> } }).sidebarAction;
	if (sidebar) browser.action.onClicked.addListener(() => void sidebar.toggle());
}

// Account and sync. The data key lives only here and in storage.session (gone when the browser closes).
const account = createAccountService({
	local: browser.storage.local,
	session: browser.storage.session,
	connect: neonSql,
	bakedUrl: __TB_DATABASE_URL__
});

const SYNC_DELAY_MS = 1500;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
function syncSoon() {
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => void account.sync(), SYNC_DELAY_MS);
}

export default defineBackground(() => {
	openPanelOnToolbarClick();

	// Only extension pages and this worker may read the session (where the unlocked key lives).
	void browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
	void account.publish();

	// Anything that changes which tools may run: install/update, browser start, site access, settings.
	for (const event of [
		browser.runtime.onInstalled,
		browser.runtime.onStartup,
		browser.permissions.onAdded,
		browser.permissions.onRemoved
	]) {
		event.addListener(() => void syncScripts());
	}
	settings.subscribe((s) => void syncScripts(s));

	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (!isAccountRequest(message)) return;
		void account.handle(message).then(sendResponse);
		return true; // answer asynchronously
	});

	browser.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;
		void account.noteLocalChanges(Object.keys(changes)).then((changed) => changed && syncSoon());
	});

	// Pull changes from other devices every few minutes, and lock after a long time unused.
	void browser.alarms.create('tb:sync', { periodInMinutes: 5 });
	void browser.alarms.create('tb:auto-lock', { periodInMinutes: 15 });
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === 'tb:sync') void account.sync();
		if (alarm.name === 'tb:auto-lock') void account.autoLock();
	});
});
