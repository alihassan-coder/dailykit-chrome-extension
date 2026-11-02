// Ways into the agent from outside its panel (the side panel's search, the right-click menu) and the chat
// kept per tab. Both live in storage.session: gone when the browser closes, and readable only by Toolbelt's
// own pages and background (the background sets the session's access level), never by a website.
import { toolValue, type SettingsArea } from '@toolbelt/core';
import { browser } from 'wxt/browser';

type Listener = Parameters<SettingsArea['onChanged']['addListener']>[0];
const wrapped = new Map<Listener, (changes: Record<string, { newValue?: unknown }>) => void>();

/** browser.storage.session in the shape the core stores expect. */
export const sessionArea: SettingsArea = {
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

/** Something to ask the agent: a prompt to run (`send`) or to prefill, and text the user selected. */
export interface AgentDraft {
	text: string;
	/** Text selected on the page, attached as context. */
	context?: string;
	/** Run straight away instead of waiting in the composer. */
	send: boolean;
	at: number;
}

/** A draft older than this is stale (the panel was never opened to take it) and is ignored. */
export const DRAFT_TTL_MS = 60_000;

export function resolveDraft(raw: unknown): AgentDraft | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.text !== 'string' || typeof r.at !== 'number') return null;
	return {
		text: r.text,
		context: typeof r.context === 'string' && r.context.trim() ? r.context : undefined,
		send: r.send === true,
		at: r.at
	};
}

export const isFresh = (draft: AgentDraft | null, now = Date.now()): draft is AgentDraft =>
	draft !== null && now - draft.at < DRAFT_TTL_MS && (draft.text.trim() !== '' || !!draft.context);

export const agentDraft = toolValue(sessionArea, 'agent', 'draft', resolveDraft);

/** Hands the agent a prompt. The side panel opens the agent when it sees one. */
export const askAgent = (draft: Omit<AgentDraft, 'at'>) => agentDraft.set({ ...draft, at: Date.now() });

/** Where one tab's conversation is kept (storage.session). The background removes it when the tab closes. */
export const chatKey = (tabId: number) => `tb:agent:chat:${tabId}`;
