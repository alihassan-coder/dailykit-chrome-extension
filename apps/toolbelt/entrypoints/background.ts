/// <reference types="@toolbelt/wxt-kit/registry" />
import { createSettingsStore, enabledToolIds, syncToolScripts, type Settings } from '@toolbelt/core';
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

export default defineBackground(() => {
	openPanelOnToolbarClick();

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
});
