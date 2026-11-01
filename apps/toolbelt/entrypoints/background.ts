/// <reference types="@toolbelt/wxt-kit/registry" />
import { reconcileScripts } from '@toolbelt/core';
import registry from 'virtual:toolbelt/registry';

// Spike: every tool counts as switched on until the dashboard and settings store exist (Phase 2).
const enabled = () => registry.tools.map((t) => t.id);

async function reconcile() {
	await reconcileScripts({
		tools: registry.tools,
		enabled: enabled(),
		hasAccess: (origins) => browser.permissions.contains({ origins }),
		scripting: browser.scripting
	});
}

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => void reconcile());
	browser.runtime.onStartup.addListener(() => void reconcile());
	browser.permissions.onAdded.addListener(() => void reconcile());
	browser.permissions.onRemoved.addListener(() => void reconcile());
});
