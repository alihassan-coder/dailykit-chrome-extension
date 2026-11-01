// Memory end to end: real mem0, real Postgres (PGlite), real encryption, fake AI providers.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRequest, MemoryResponse } from '@toolbelt/core';
import { createAccountService, decryptRecord, FAST_TEST_KDF, importDataKey, type Sql } from '@toolbelt/db';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from '../../db/test/pglite.ts';
import { createMemoryService } from '../src/service.ts';
import { fakeProviders, memoryArea } from './fakes.ts';

let db: Sql & { close(): Promise<void> };

beforeAll(() => {
	// Under Node, mem0 keeps an id file in ~/.mem0; keep it out of the home folder.
	process.env.MEM0_DIR = mkdtempSync(join(tmpdir(), 'mem0-'));
});
beforeEach(async () => {
	db = await testDatabase();
});
afterEach(() => db.close());

async function device(opts: { keys?: Record<string, string>; username?: string; signIn?: boolean } = {}) {
	const local = memoryArea();
	const session = memoryArea();
	local.data['tb:ai:keys'] = opts.keys ?? { openai: 'sk-test-openai-0000000000' };
	const account = createAccountService({
		local,
		session,
		connect: () => db,
		bakedUrl: 'postgresql://u:p@db/x',
		kdf: { password: FAST_TEST_KDF, recovery: FAST_TEST_KDF }
	});
	const username = opts.username ?? 'ali';
	await account.handle({
		type: opts.signIn ? 'account:sign-in' : 'account:create',
		username,
		password: 'correct horse battery'
	});
	const providers = fakeProviders();
	const memory = createMemoryService({ local, account, fetch: providers.fetch });
	const ask = (req: MemoryRequest) => memory.handle(req);
	const remember = (...facts: string[]) =>
		ask({ type: 'memory:add', messages: facts.flatMap((f) => [{ role: 'user' as const, content: f }]) });
	const list = async () => {
		const res = await ask({ type: 'memory:list' });
		return res.ok ? (res.items ?? []) : [];
	};
	return { local, session, account, memory, providers, ask, remember, list };
}

const texts = (res: MemoryResponse) => (res.ok ? (res.items ?? []).map((i) => i.text) : []);

describe('memory is off until it can run', () => {
	it('needs an account', async () => {
		const memory = createMemoryService({
			local: memoryArea(),
			account: { unlocked: async () => null, database: async () => db }
		});
		const res = await memory.handle({ type: 'memory:status' });
		expect(res.status).toEqual({ state: 'no-account' });
		expect(await memory.handle({ type: 'memory:recall', query: 'x' })).toMatchObject({ ok: true, items: [] });
	});

	it('needs an OpenAI or Gemini key for embeddings, and leaves everything else alone', async () => {
		const d = await device({ keys: { anthropic: 'sk-ant-test-0000000000' } });
		expect((await d.ask({ type: 'memory:status' })).status).toEqual({ state: 'no-embedding-key' });
		expect(await d.ask({ type: 'memory:recall', query: 'anything' })).toMatchObject({ ok: true, items: [] });
		expect(await d.remember('I am vegetarian')).toMatchObject({ ok: true });
		const del = await d.ask({ type: 'memory:delete-all' });
		expect(del).toMatchObject({ ok: false, error: expect.stringContaining('OpenAI or Gemini') });
		expect(d.providers.calls).toEqual([]);
		expect((await d.account.state()).state).toBe('unlocked');
	});
});

describe('remembering', () => {
	it('adds, recalls and deletes memories through mem0', async () => {
		const d = await device();
		const added = await d.remember('I am vegetarian and live in Lahore', 'My favourite editor is Neovim');
		expect(added).toMatchObject({ ok: true, status: { state: 'ready', count: 2, lastError: null } });
		expect((await d.list()).map((m) => m.text).sort()).toEqual([
			'I am vegetarian and live in Lahore',
			'My favourite editor is Neovim'
		]);

		const recalled = await d.ask({ type: 'memory:recall', query: 'what food does the user eat? vegetarian' });
		expect(texts(recalled)[0]).toBe('I am vegetarian and live in Lahore');

		const id = (await d.list()).find((m) => m.text.includes('Neovim'))!.id;
		await d.ask({ type: 'memory:delete', id });
		expect((await d.list()).map((m) => m.text)).toEqual(['I am vegetarian and live in Lahore']);
	});

	it('does not save the same fact twice', async () => {
		const d = await device();
		await d.remember('I am vegetarian');
		await d.remember('I am vegetarian');
		expect(await d.list()).toHaveLength(1);
	});

	it('uses the extraction model cheaply: the provider the agent uses, its smallest fast model', async () => {
		const d = await device();
		d.local.data['tb:agent:model'] = { provider: 'openai', model: 'gpt-5.5' };
		d.local.data['tb:ai:models'] = {
			openai: { models: [{ id: 'gpt-5.5' }, { id: 'gpt-5.5-mini' }, { id: 'gpt-5-mini-2025-08-07' }] }
		};
		const res = await d.ask({ type: 'memory:status' });
		expect(res.status).toMatchObject({
			extractor: 'openai/gpt-5.5-mini',
			embedder: 'openai/text-embedding-3-small@512'
		});
		await d.remember('I prefer dark mode');
		const chat = d.providers.calls.find((c) => c.url.endsWith('/chat/completions'))!;
		expect(chat.body).toMatchObject({ model: 'gpt-5.5-mini', response_format: { type: 'json_object' } });
	});

	it('honours the switch: no saving and no recall while it is off', async () => {
		const d = await device();
		await d.remember('I am vegetarian');
		await d.ask({ type: 'memory:set-enabled', enabled: false });
		expect(d.local.data['tb:memory:settings']).toEqual({ enabled: false });
		expect(texts(await d.ask({ type: 'memory:recall', query: 'vegetarian' }))).toEqual([]);
		await d.remember('I have a cat');
		expect(await d.list()).toHaveLength(1);
		expect((await d.ask({ type: 'memory:status' })).status).toMatchObject({ enabled: false });
	});

	it('deletes everything, including history and entities, on "Delete all"', async () => {
		const d = await device();
		await d.remember('I work at Innoxitech in Lahore', 'I like Python');
		await d.ask({ type: 'memory:delete-all' });
		expect(await d.list()).toEqual([]);
		const live = await db.query<{ collection: string }>(
			`SELECT collection FROM toolbelt.records WHERE collection LIKE 'memory%' AND NOT deleted`
		);
		expect(live).toEqual([]);
	});
});

describe('storage', () => {
	it('stores only ciphertext in Neon, which the account key opens again', async () => {
		const d = await device();
		await d.remember('My passport expires in March');
		const rows = await db.query<{ user_id: string; collection: string; id: string; ciphertext: string }>(
			`SELECT user_id, collection, id, ciphertext FROM toolbelt.records WHERE collection LIKE 'memory%' AND NOT deleted`
		);
		expect(new Set(rows.map((r) => r.collection))).toEqual(new Set(['memory', 'memory-entity', 'memory-history']));
		// Plain columns hold no memory text, and neither do the ciphertext's bytes. (Searching the base64 text
		// itself would now and then "find" a word by chance.)
		const all = await db.query<{ ciphertext: string }>('SELECT * FROM toolbelt.records');
		const plain = JSON.stringify(all.map(({ ciphertext: _, ...rest }) => rest));
		const bytes = all.map((r) => Buffer.from(r.ciphertext, 'base64').toString('latin1')).join('');
		for (const text of [plain, bytes]) expect(text).not.toMatch(/passport|March|text-embedding/);

		const key = await importDataKey(String(d.session.data['tb:session:key']));
		const memoryRow = rows.find((r) => r.collection === 'memory')!;
		const opened = await decryptRecord<{ model: string; payload: { data: string } }>(
			key,
			{ userId: memoryRow.user_id, collection: 'memory', id: memoryRow.id },
			memoryRow.ciphertext
		);
		expect(opened).toMatchObject({
			model: 'openai/text-embedding-3-small@512',
			payload: { data: 'My passport expires in March' }
		});
		// Bound to its address: the same ciphertext does not open as another record.
		await expect(
			decryptRecord(key, { userId: memoryRow.user_id, collection: 'memory', id: 'other' }, memoryRow.ciphertext)
		).rejects.toThrow();
	});

	it('follows the account to another device', async () => {
		const laptop = await device();
		await laptop.remember('I am vegetarian');
		const desktop = await device({ signIn: true });
		expect((await desktop.list()).map((m) => m.text)).toEqual(['I am vegetarian']);
		await laptop.remember('I have two cats');
		await desktop.memory.sync();
		expect(await desktop.list()).toHaveLength(2);
	});

	it('keeps each user to their own memories', async () => {
		const ali = await device({ username: 'ali' });
		const sara = await device({ username: 'sara' });
		await ali.remember('I am vegetarian');
		await sara.remember('I love steak');
		expect(texts(await sara.ask({ type: 'memory:recall', query: 'I am vegetarian' }))).not.toContain('I am vegetarian');
		expect((await sara.list()).map((m) => m.text)).toEqual(['I love steak']);
		expect((await ali.list()).map((m) => m.text)).toEqual(['I am vegetarian']);
		const owners = await db.query<{ n: number }>(
			`SELECT count(DISTINCT user_id)::int AS n FROM toolbelt.records WHERE collection = 'memory'`
		);
		expect(owners[0]!.n).toBe(2);
	});

	it('does not disturb settings sync', async () => {
		const d = await device();
		await d.remember('I am vegetarian');
		const before = { ...d.local.data };
		await d.account.sync();
		// Settings sync pulls only its own records: nothing new on the device but its cursor.
		const added = Object.keys(d.local.data).filter((k) => !(k in before));
		expect(added.filter((k) => k !== 'tb:sync:since')).toEqual([]);
		expect(JSON.stringify(d.local.data)).not.toContain('vegetarian');
		// The memory outbox and queue never sync as settings.
		expect(await d.account.noteLocalChanges(['tb:sync:memory-outbox', 'tb:sync:memory-queue'])).toBe(false);
	});

	it('drops the decrypted copy when Toolbelt locks', async () => {
		const d = await device();
		await d.remember('I am vegetarian');
		await d.account.handle({ type: 'account:lock' });
		expect((await d.ask({ type: 'memory:list' })).status).toEqual({ state: 'locked' });
		expect(await d.ask({ type: 'memory:recall', query: 'vegetarian' })).toMatchObject({ items: [] });
	});

	it('keeps a chat to remember while offline, encrypted, and retries it on the next sync', async () => {
		const d = await device();
		await d.ask({ type: 'memory:status' });
		d.providers.setOffline(true);
		const res = await d.remember('I am vegetarian');
		expect(res.status).toMatchObject({ lastError: expect.stringMatching(/try again/) });
		expect(JSON.stringify(d.local.data)).not.toContain('vegetarian');
		d.providers.setOffline(false);
		await d.memory.sync();
		expect((await d.list()).map((m) => m.text)).toEqual(['I am vegetarian']);
		expect(d.local.data['tb:sync:memory-queue']).toEqual([]);
	});

	it('flags memories from another embedding model and leaves them out of recall', async () => {
		const d = await device();
		await d.remember('I am vegetarian');
		d.local.data['tb:ai:keys'] = { gemini: 'AIza-test-0000000000000' };
		const res = await d.ask({ type: 'memory:list' });
		expect(res.status).toMatchObject({ embedder: 'gemini/gemini-embedding-001@768', count: 0, otherModel: 1 });
		expect(res.ok && res.items).toEqual([expect.objectContaining({ text: 'I am vegetarian', otherModel: true })]);
		expect(texts(await d.ask({ type: 'memory:recall', query: 'vegetarian' }))).toEqual([]);
		await d.remember('I have a cat');
		expect(texts(await d.ask({ type: 'memory:recall', query: 'cat' }))).toEqual(['I have a cat']);
	});
});

describe('privacy', () => {
	it('keeps mem0 telemetry off: no PostHog, no GitHub notices, only the AI provider', async () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		try {
			expect(process.env.MEM0_TELEMETRY).toBe('false');
			const d = await device();
			await d.remember('I am vegetarian');
			await d.ask({ type: 'memory:recall', query: 'vegetarian' });
			await d.ask({ type: 'memory:delete-all' });
			const urls = [...spy.mock.calls.map((c) => String(c[0])), ...d.providers.calls.map((c) => c.url)];
			expect(urls.filter((u) => /posthog|githubusercontent|mem0\.ai/.test(u))).toEqual([]);
			expect(new Set(d.providers.calls.map((c) => new URL(c.url).host))).toEqual(new Set(['api.openai.com']));
		} finally {
			spy.mockRestore();
		}
	});
});
