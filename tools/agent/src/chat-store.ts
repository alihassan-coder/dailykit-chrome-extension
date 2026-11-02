// The conversation shown in the panel, kept per tab in storage.session so closing and reopening the side panel
// (or switching tabs and back) brings it back. Screenshots are dropped before saving: they are large and the
// model has already seen them.
import type { AppError } from '@toolbelt/core';
import type { ModelMessage } from 'ai';
import { browser } from 'wxt/browser';
import { chatKey } from './handoff.ts';
import type { RunUsage, StepStatus } from './loop.ts';

export type Entry =
	/** `historyAt`: how many model messages came before this turn, so the turn can be run again. */
	| { id: string; kind: 'user'; text: string; context?: string; historyAt: number }
	| { id: string; kind: 'assistant'; text: string; usage?: RunUsage }
	| { id: string; kind: 'step'; summary: string; status: StepStatus; detail?: string; ms?: number }
	| { id: string; kind: 'notice'; text: string }
	| { id: string; kind: 'error'; error: AppError };

export interface SavedChat {
	entries: Entry[];
	history: ModelMessage[];
}

export const SHOT_DROPPED = '[screenshot not kept]';
/** Older entries are dropped past this, so one long chat never fills the session store. */
export const MAX_ENTRIES = 200;

const KINDS = new Set(['user', 'assistant', 'step', 'notice', 'error']);

const isEntry = (e: unknown): e is Entry =>
	typeof e === 'object' &&
	e !== null &&
	typeof (e as { id?: unknown }).id === 'string' &&
	KINDS.has((e as { kind?: string }).kind ?? '');

export function resolveChat(raw: unknown): SavedChat | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (!Array.isArray(r.entries) || !Array.isArray(r.history)) return null;
	const entries = r.entries.filter(isEntry).map((e) =>
		// A step saved mid-run never finished.
		e.kind === 'step' && e.status === 'running' ? { ...e, status: 'failed' as const } : e
	);
	return { entries, history: r.history as ModelMessage[] };
}

/** The chat as it is saved: no images, at most MAX_ENTRIES entries. */
export function toSaved(entries: Entry[], history: ModelMessage[]): SavedChat {
	return {
		entries: entries.slice(-MAX_ENTRIES),
		history: history.map((m) =>
			m.role === 'user' && Array.isArray(m.content)
				? {
						...m,
						content: m.content.map((part) =>
							part.type === 'image' || part.type === 'file' ? { type: 'text' as const, text: SHOT_DROPPED } : part
						)
					}
				: m
		)
	};
}

export async function loadChat(tabId: number): Promise<SavedChat | null> {
	const key = chatKey(tabId);
	return resolveChat((await browser.storage.session.get(key))[key]);
}

export function saveChat(tabId: number, entries: Entry[], history: ModelMessage[]): Promise<void> {
	const key = chatKey(tabId);
	if (!entries.length) return browser.storage.session.remove(key);
	return browser.storage.session.set({ [key]: toSaved(entries, history) });
}
