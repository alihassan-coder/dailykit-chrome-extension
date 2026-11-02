import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, SHOT_DROPPED, resolveChat, toSaved, type Entry } from '../src/chat-store.ts';
import { isFresh, resolveDraft, DRAFT_TTL_MS } from '../src/handoff.ts';

describe('the saved chat', () => {
	it('drops screenshots and keeps everything else', () => {
		const saved = toSaved(
			[{ id: 'u1', kind: 'user', text: 'Hi', historyAt: 0 }],
			[
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Look' },
						{ type: 'image', image: 'data:image/jpeg;base64,AAAA' }
					]
				},
				{ role: 'assistant', content: 'Seen.' }
			]
		);
		expect(saved.history).toEqual([
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'Look' },
					{ type: 'text', text: SHOT_DROPPED }
				]
			},
			{ role: 'assistant', content: 'Seen.' }
		]);
	});

	it('keeps only the latest entries', () => {
		const many: Entry[] = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({
			id: `n${i}`,
			kind: 'notice',
			text: `${i}`
		}));
		const saved = toSaved(many, []);
		expect(saved.entries).toHaveLength(MAX_ENTRIES);
		expect(saved.entries[0]!.id).toBe('n5');
	});

	it('reads back only valid chats, and marks a step saved mid-run as not finished', () => {
		expect(resolveChat(undefined)).toBeNull();
		expect(resolveChat({ entries: 'x', history: [] })).toBeNull();
		const chat = resolveChat({
			entries: [{ id: 's', kind: 'step', summary: 'Click', status: 'running' }, { bogus: true }],
			history: []
		});
		expect(chat?.entries).toEqual([{ id: 's', kind: 'step', summary: 'Click', status: 'failed' }]);
	});
});

describe('hand-overs to the agent', () => {
	it('accepts only well-formed, recent drafts', () => {
		expect(resolveDraft(null)).toBeNull();
		expect(resolveDraft({ text: 1, at: 0 })).toBeNull();
		const d = resolveDraft({ text: 'Summarise', send: true, at: 1000, context: '  ' });
		expect(d).toEqual({ text: 'Summarise', send: true, at: 1000, context: undefined });
		expect(isFresh(d, 1000 + DRAFT_TTL_MS - 1)).toBe(true);
		expect(isFresh(d, 1000 + DRAFT_TTL_MS)).toBe(false);
		expect(isFresh({ text: ' ', send: false, at: 1000 }, 1001)).toBe(false);
		expect(isFresh({ text: '', context: 'words', send: false, at: 1000 }, 1001)).toBe(true);
	});
});
