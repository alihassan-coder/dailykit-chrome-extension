/// <reference types="@toolbelt/wxt-kit/registry" />
import { syncToolScripts } from '@toolbelt/core';
import registry from 'virtual:toolbelt/registry';

// Until the dashboard and its settings store exist, every tool counts as switched on.
const enabledTools = () => registry.tools.map((t) => t.id);

function syncScripts() {
	return syncToolScripts({
		tools: registry.tools,
		enabled: enabledTools(),
		hasAccess: (origins) => browser.permissions.contains({ origins }),
		scripting: browser.scripting
	});
}

export default defineBackground(() => {
	// Anything that can change which tools may run: install/update, browser start, site access granted or revoked.
	for (const event of [
		browser.runtime.onInstalled,
		browser.runtime.onStartup,
		browser.permissions.onAdded,
		browser.permissions.onRemoved
	]) {
		event.addListener(() => void syncScripts());
	}
});
