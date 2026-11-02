/// <reference types="@toolbelt/wxt-kit/registry" />
// First, before anything loads mem0: it needs a `process`, with its telemetry switched off.
import '../shims/process.ts';
import {
	ACCOUNT_STATE_KEY,
	createSettingsStore,
	enabledToolIds,
	isAccountRequest,
	isMemoryRequest,
	syncToolScripts,
	type AccountResponse,
	type AccountState,
	type MemoryResponse,
	type Settings
} from '@toolbelt/core';
import { createAccountService, neonSql } from '@toolbelt/db';
import { createMemoryService } from '@toolbelt/memory';
import { localArea } from '@toolbelt/ui/storage';
import registry from 'virtual:toolbelt/registry';
import { browser } from 'wxt/browser';

const settings = createSettingsStore(localArea, registry.tools);

/** For promises nobody awaits: a failure is logged, never an unhandled rejection. */
const warn = (what: string) => (e: unknown) => console.warn(`Toolbelt: ${what} failed`, e);

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
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(warn('opening the side panel'));
		return;
	}
	const sidebar = (browser as unknown as { sidebarAction?: { toggle(): Promise<void> } }).sidebarAction;
	if (!sidebar) return;
	browser.action.onClicked.addListener(() => {
		sidebar.toggle().catch(warn('opening the sidebar'));
	});
}

// Account and sync. The data key lives only here and in storage.session (gone when the browser closes).
const account = createAccountService({
	local: browser.storage.local,
	session: browser.storage.session,
	connect: neonSql,
	bakedUrl: __TB_DATABASE_URL__
});

// The agent's long-term memory (mem0), encrypted with the same data key and stored in the same database.
const memory = createMemoryService({ local: browser.storage.local, account });

const SYNC_DELAY_MS = 1500;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
function syncSoon() {
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => {
		account.sync().catch(warn('sync'));
	}, SYNC_DELAY_MS);
}

const FAILED = 'Toolbelt could not finish that. Try again.';

/** An answer in the usual shape when the account service itself threw, so the screen is never left waiting. */
async function accountFailure(e: unknown): Promise<AccountResponse> {
	warn('an account request')(e);
	const state = await account.state().catch((): AccountState => ({ state: 'database-error', message: FAILED }));
	return { ok: false, account: state, error: FAILED };
}

async function memoryFailure(e: unknown): Promise<MemoryResponse> {
	warn('a memory request')(e);
	const state = await account.state().catch(() => null);
	const signedOut = state?.state === 'no-account' || state?.state === 'no-database';
	return {
		ok: false,
		status: { state: signedOut ? 'no-account' : 'locked' },
		error: 'Memory could not finish that. Try again.'
	};
}

export default defineBackground(() => {
	openPanelOnToolbarClick();

	// Only extension pages and this worker may read the session (where the unlocked key lives).
	browser.storage.session
		.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
		?.catch(warn('locking the session store'));
	account.publish().catch(warn('publishing the account state'));

	// Anything that changes which tools may run: install/update, browser start, site access, settings.
	for (const event of [
		browser.runtime.onInstalled,
		browser.runtime.onStartup,
		browser.permissions.onAdded,
		browser.permissions.onRemoved
	]) {
		event.addListener(() => {
			syncScripts().catch(warn('registering tool scripts'));
		});
	}
	settings.subscribe((s) => {
		syncScripts(s).catch(warn('registering tool scripts'));
	});

	// Memories are only for Toolbelt's own pages (side panel, dashboard), never for scripts running in a website.
	const fromOwnPage = (sender: { url?: string }) => Boolean(sender.url?.startsWith(browser.runtime.getURL('/')));
	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		// A failure still answers, in the usual shape, so the screen that asked is never left waiting.
		if (isAccountRequest(message))
			account.handle(message).catch(accountFailure).then(sendResponse).catch(warn('answering an account request'));
		else if (isMemoryRequest(message) && fromOwnPage(sender))
			memory.handle(message).catch(memoryFailure).then(sendResponse).catch(warn('answering a memory request'));
		else return;
		return true; // answer asynchronously
	});

	browser.storage.onChanged.addListener((changes, area) => {
		// Just unlocked: download and decrypt the agent's memories now, not on the first question.
		const state = changes[ACCOUNT_STATE_KEY] as { oldValue?: AccountState; newValue?: AccountState } | undefined;
		if (area === 'session' && state?.newValue?.state === 'unlocked' && state.oldValue?.state !== 'unlocked')
			memory.sync().catch(warn('memory sync'));
		if (area !== 'local') return;
		account
			.noteLocalChanges(Object.keys(changes))
			.then((changed) => changed && syncSoon())
			.catch(warn('noting local changes'));
	});

	// Pull changes from other devices every few minutes, and lock after a long time unused.
	browser.alarms.create('tb:sync', { periodInMinutes: 5 }).catch(warn('scheduling sync'));
	browser.alarms.create('tb:auto-lock', { periodInMinutes: 15 }).catch(warn('scheduling auto-lock'));
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === 'tb:sync')
			account
				.sync()
				.then(() => memory.sync())
				.catch(warn('sync'));
		if (alarm.name === 'tb:auto-lock') account.autoLock().catch(warn('auto-lock'));
	});
});
