// The side panel's side of the page connection: implements the loop's PageApi for one pinned tab.
import { toAppError } from '@toolbelt/core';
import { browser } from 'wxt/browser';
import type { ActionResult } from './actuation.ts';
import type { PageApi, Shot, Target } from './loop.ts';
import type { PageRequest } from './protocol.ts';

// Built path of the page script (wxt-kit names it <tool>-<script>). Used to add it to tabs opened before
// the agent was switched on.
const PAGE_SCRIPT = '/content-scripts/agent-page.js';
const NAVIGATION_TIMEOUT_MS = 10_000;
const PING_TIMEOUT_MS = 1500;

export interface ActiveTab {
	id: number;
	windowId: number;
	/** Empty when Toolbelt has no access to the tab's site (the browser hides the address then). */
	url: string;
	title: string;
	favIconUrl?: string;
}

export async function activeTab(): Promise<ActiveTab | null> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab?.id !== undefined
		? { id: tab.id, windowId: tab.windowId, url: tab.url ?? '', title: tab.title ?? '', favIconUrl: tab.favIconUrl }
		: null;
}

/** Whether Toolbelt may read this origin (an empty or unparsable address never is). */
export async function hasHostAccess(url: string): Promise<boolean> {
	let origin: string;
	try {
		origin = new URL(url).origin;
	} catch {
		return false;
	}
	try {
		return await browser.permissions.contains({ origins: [`${origin}/*`] });
	} catch {
		return true; // no permissions API (tests, other browsers): the page script answers for itself
	}
}

/** Asks for access to the tab's site, or to every site when the address is hidden. Must run in a click handler. */
export function requestHostAccess(url: string): Promise<boolean> {
	let origins = ['<all_urls>'];
	try {
		if (url) origins = [`${new URL(url).origin}/*`];
	} catch {
		origins = ['<all_urls>']; // an address that does not parse: ask for the agent's declared sites instead
	}
	return browser.permissions.request({ origins });
}

/** A failure reported by the page script (it never sends error details). */
class PageScriptError extends Error {
	constructor(kind: string) {
		super(`page script failed: ${kind}`);
		this.name = 'PageScriptError';
	}
}

const isErrorReply = (r: unknown): r is { error: string } =>
	typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error: unknown }).error === 'string';

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
	});

/** The loop's page connection, plus what only the panel asks for (the user's selection). */
export type PanelPageApi = PageApi & { selection(): Promise<string> };

export function pageApi(tabId: number, windowId: number, opts: { screenshots: boolean }): PanelPageApi {
	async function ping(): Promise<boolean> {
		try {
			const pong = await Promise.race([
				browser.tabs.sendMessage(tabId, { type: 'agent:ping' } satisfies PageRequest),
				sleep(PING_TIMEOUT_MS).then(() => false)
			]);
			return pong === true;
		} catch {
			return false; // no page script listening yet
		}
	}

	// Adds the page script only when no copy answers, so a request is never sent (or an action run) twice.
	async function ensureScript() {
		if (await ping()) return;
		await browser.scripting.executeScript({ target: { tabId }, files: [PAGE_SCRIPT] });
	}

	async function send<T>(req: PageRequest): Promise<T> {
		await ensureScript();
		const reply = (await browser.tabs.sendMessage(tabId, req)) as unknown;
		if (isErrorReply(reply)) throw new PageScriptError(reply.error);
		return reply as T;
	}

	function waitForLoad(): { done: Promise<'complete' | 'timeout' | 'closed'>; cancel(): void } {
		let cancel = () => {};
		const done = new Promise<'complete' | 'timeout' | 'closed'>((resolve) => {
			const timer = setTimeout(() => finish('timeout'), NAVIGATION_TIMEOUT_MS);
			function finish(how: 'complete' | 'timeout' | 'closed') {
				clearTimeout(timer);
				browser.tabs.onUpdated.removeListener(onUpdated);
				browser.tabs.onRemoved.removeListener(onRemoved);
				resolve(how);
			}
			function onUpdated(id: number, change: { status?: string }) {
				if (id === tabId && change.status === 'complete') finish('complete');
			}
			function onRemoved(id: number) {
				if (id === tabId) finish('closed');
			}
			browser.tabs.onUpdated.addListener(onUpdated);
			browser.tabs.onRemoved.addListener(onRemoved);
			cancel = () => finish('timeout');
		});
		return { done, cancel };
	}

	async function tab() {
		return browser.tabs.get(tabId);
	}

	/** After the page script went away mid-action: did the tab navigate? Then wait for the new page. */
	async function afterLostReply(startUrl: string | undefined): Promise<ActionResult | null> {
		const load = waitForLoad();
		const now = await tab();
		if (now.status !== 'loading') load.cancel();
		if (now.status !== 'loading' && now.url === startUrl) return null;
		const how = now.status === 'loading' ? await load.done : 'complete';
		if (how === 'closed') return { ok: false, message: 'The tab was closed.' };
		const after = await tab();
		return {
			ok: true,
			message: `The page navigated to ${after.url ?? 'a new address'}${how === 'timeout' ? ' and is still loading' : ''}. Read the page to see it.`
		};
	}

	return {
		url: async () => (await tab()).url ?? '',
		title: async () => (await tab()).title ?? '',
		read: (o) => send<string>({ type: 'agent:read', ...o }),
		find: (query) => send<string>({ type: 'agent:find', query }),
		text: () => send<string>({ type: 'agent:text' }),
		selection: () => send<string>({ type: 'agent:selection' }),
		target: (ref) => send<Target | null>({ type: 'agent:target', ref }),
		focused: () => send<Target | null>({ type: 'agent:focused' }),
		act: async (action) => {
			await ensureScript();
			const startUrl = (await tab()).url;
			try {
				const reply = (await browser.tabs.sendMessage(tabId, {
					type: 'agent:act',
					action
				} satisfies PageRequest)) as unknown;
				if (isErrorReply(reply)) throw new PageScriptError(reply.error);
				const result = reply as ActionResult;
				// The page answered, but the action may have started a navigation: wait for the tab to load.
				const now = await tab();
				if (!result.ok || (now.status !== 'loading' && now.url === startUrl)) return result;
				const load = waitForLoad();
				const latest = await tab();
				if (latest.status !== 'loading') load.cancel();
				const how = latest.status === 'loading' ? await load.done : 'complete';
				const after = how === 'closed' ? null : await tab();
				return {
					ok: true,
					message: after
						? `${result.message} The page navigated to ${after.url ?? 'a new address'}${how === 'timeout' ? ' and is still loading' : ''}.`
						: `${result.message} The tab was then closed.`
				};
			} catch (error) {
				// A click that opens another page unloads the page script before it can answer. Never retry the
				// action: it may already have happened.
				const navigated = await afterLostReply(startUrl);
				if (navigated) return navigated;
				throw error;
			}
		},
		wait: async ({ ms, selector, text }) => {
			if (!selector && !text) {
				const time = Math.min(Math.max(ms ?? 1000, 0), 10_000);
				await sleep(time);
				const t = await tab();
				return {
					ok: true,
					message: `Waited ${time} ms. The tab is ${t.status === 'loading' ? 'still loading' : 'loaded'}.`
				};
			}
			return send<ActionResult>({ type: 'agent:wait', selector, text, timeoutMs: ms ?? 5000 });
		},
		highlight: async (ref) => {
			try {
				return await send<boolean>({ type: 'agent:highlight', ref });
			} catch {
				return false; // the outline is only a visual aid; the approval card says when it could not be drawn
			}
		},
		screenshot: async (): Promise<Shot> => {
			if (!opts.screenshots) return { ok: false, reason: 'Screenshots are switched off in the agent’s settings.' };
			// captureVisibleTab takes whatever tab is in front: never capture a tab the agent is not working on.
			const [front] = await browser.tabs.query({ active: true, windowId });
			if (front?.id !== tabId)
				return { ok: false, reason: 'The tab the agent works on is not in front, so no screenshot was taken.' };
			try {
				return { ok: true, image: await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 }) };
			} catch (error) {
				return { ok: false, reason: `Could not take a screenshot: ${toAppError(error).title}.` };
			}
		},
		navigate: async (url) => {
			const load = waitForLoad();
			try {
				await browser.tabs.update(tabId, { url });
			} catch (error) {
				load.cancel();
				return { ok: false, message: `Could not open ${url}: ${toAppError(error).title}.` };
			}
			const how = await load.done;
			if (how === 'closed') return { ok: false, message: 'The tab was closed.' };
			const t = await tab();
			if (how === 'timeout')
				return {
					ok: false,
					message: `${url} did not finish loading within ${NAVIGATION_TIMEOUT_MS / 1000} s. Use wait, then read the page.`
				};
			return { ok: true, message: `Opened ${t.url ?? url}. Read the page to see it.` };
		}
	};
}
