// The side panel's side of the page connection: implements the loop's PageApi for one pinned tab.
import { browser } from 'wxt/browser';
import type { ActionResult } from './actuation.ts';
import type { PageApi, Target } from './loop.ts';
import type { PageRequest } from './protocol.ts';

// Built path of the page script (wxt-kit names it <tool>-<script>). Used to add it to tabs opened before
// the agent was switched on.
const PAGE_SCRIPT = '/content-scripts/agent-page.js';
const NAVIGATION_TIMEOUT_MS = 10_000;

export async function activeTab() {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab?.id !== undefined ? { id: tab.id, windowId: tab.windowId, url: tab.url ?? '' } : null;
}

export function pageApi(tabId: number, windowId: number, opts: { screenshots: boolean }): PageApi {
	async function send<T>(req: PageRequest): Promise<T> {
		try {
			return (await browser.tabs.sendMessage(tabId, req)) as T;
		} catch {
			// No page script yet (tab opened before install, or a page that just loaded): add it once, then retry.
			await browser.scripting.executeScript({ target: { tabId }, files: [PAGE_SCRIPT] });
			return (await browser.tabs.sendMessage(tabId, req)) as T;
		}
	}

	function waitForLoad(): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(done, NAVIGATION_TIMEOUT_MS);
			function done() {
				clearTimeout(timer);
				browser.tabs.onUpdated.removeListener(onUpdated);
				resolve();
			}
			function onUpdated(id: number, change: { status?: string }) {
				if (id === tabId && change.status === 'complete') done();
			}
			browser.tabs.onUpdated.addListener(onUpdated);
		});
	}

	return {
		url: async () => (await browser.tabs.get(tabId)).url ?? '',
		read: (o) => send<string>({ type: 'agent:read', ...o }),
		find: (query) => send<string>({ type: 'agent:find', query }),
		text: () => send<string>({ type: 'agent:text' }),
		target: (ref) => send<Target | null>({ type: 'agent:target', ref }),
		act: (action) => send<ActionResult>({ type: 'agent:act', action }),
		highlight: async (ref) => {
			await send({ type: 'agent:highlight', ref }).catch(() => {});
		},
		screenshot: async () => {
			if (!opts.screenshots) return null;
			try {
				return await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 });
			} catch {
				return null;
			}
		},
		navigate: async (url) => {
			const loaded = waitForLoad();
			await browser.tabs.update(tabId, { url });
			await loaded;
			return { ok: true, message: `Opened ${url}. Read the page to see it.` };
		}
	};
}
