// The factory patch is the one place Toolbelt relies on mem0's internal wiring. If a mem0 update changes how
// Memory builds its parts, these tests fail before memories end up somewhere else.
import { mkdtempSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newDataKey, type Sql } from '@toolbelt/db';
import { EmbedderFactory, HistoryManagerFactory, LLMFactory, VectorStoreFactory } from 'mem0ai/oss';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from '../../db/test/pglite.ts';
import { createMem0 } from '../src/mem0.ts';
import { createEmbedder, createLlm } from '../src/providers.ts';
import { MemoryStore } from '../src/store.ts';
import { fakeProviders, memoryArea } from './fakes.ts';

let db: Sql & { close(): Promise<void> };
beforeAll(() => {
	process.env.MEM0_DIR = mkdtempSync(join(tmpdir(), 'mem0-'));
});
beforeEach(async () => {
	db = await testDatabase();
	await db.query(`CREATE SCHEMA toolbelt`);
	await db.query(`CREATE TABLE toolbelt.records (user_id text, collection text, id text, ciphertext text,
		deleted boolean, updated_at timestamptz, PRIMARY KEY (user_id, collection, id))`);
});
afterEach(() => db.close());

async function parts() {
	const providers = fakeProviders();
	const store = new MemoryStore({
		database: async () => db,
		userId: 'u1',
		key: await newDataKey(),
		model: 'openai/text-embedding-3-small@512',
		local: memoryArea()
	});
	const choice = { provider: 'openai', model: 'text-embedding-3-small', dims: 512, id: 'x' } as const;
	return {
		store,
		providers,
		embedder: createEmbedder(choice, 'sk-test', providers.fetch),
		llm: createLlm({ provider: 'openai', model: 'gpt-5-mini' }, 'sk-test', providers.fetch)
	};
}

describe('mem0ai', () => {
	it('is pinned to the exact version the factory patch was written against', () => {
		const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
			dependencies: Record<string, string>;
		};
		expect(pkg.dependencies.mem0ai).toBe('3.3.1');
	});

	it('builds every part through the patched factories, and our store receives the memories', async () => {
		const p = await parts();
		const vectorStore = vi.spyOn(p.store, 'vectorStore');
		const historyStore = vi.spyOn(p.store, 'historyStore');
		const memory = createMem0({ ...p, dims: 512 });
		await memory.add('I am vegetarian', { userId: 'u1' });

		expect(vectorStore.mock.calls.map((c) => c[0])).toEqual(['memories', 'memories_entities']);
		expect(historyStore).toHaveBeenCalledOnce();
		expect(p.store.all().map((e) => e.payload.data)).toEqual(['I am vegetarian']);
		expect(p.store.all('memory-entity').length).toBeGreaterThan(0);
		expect(p.providers.calls.map((c) => new URL(c.url).pathname)).toContain('/v1/chat/completions');

		const found = await memory.search('vegetarian', { filters: { user_id: 'u1' } });
		expect(found.results.map((r) => r.memory)).toEqual(['I am vegetarian']);
		expect((await memory.history(found.results[0]!.id))[0]).toMatchObject({
			action: 'ADD',
			new_value: 'I am vegetarian'
		});
	});

	it('leaves the other providers untouched', () => {
		expect(() => VectorStoreFactory.create('no-such-store', {})).toThrow(/Unsupported vector store/);
		expect(() => LLMFactory.create('no-such-llm', {})).toThrow(/Unsupported LLM/);
		expect(() => EmbedderFactory.create('no-such-embedder', {})).toThrow(/Unsupported embedder/);
		expect(() => HistoryManagerFactory.create('no-such-history', { provider: 'x', config: {} })).toThrow(
			/Unsupported history/
		);
	});

	it('uploads only when flushed, in one transaction, and a fresh store reads it back', async () => {
		const p = await parts();
		const memory = createMem0({ ...p, dims: 512 });
		await memory.add('I have two cats', { userId: 'u1' });
		expect(await db.query('SELECT 1 FROM toolbelt.records')).toEqual([]);
		await p.store.flush();
		const rows = await db.query<{ collection: string }>('SELECT collection FROM toolbelt.records');
		expect(rows.length).toBeGreaterThan(0);

		const again = new MemoryStore({
			database: async () => db,
			userId: 'u1',
			key: (p.store as unknown as { opts: { key: CryptoKey } }).opts.key,
			model: 'openai/text-embedding-3-small@512',
			local: memoryArea()
		});
		await again.ready();
		expect(again.all().map((e) => e.payload.data)).toEqual(['I have two cats']);
		expect(Array.from(again.all()[0]!.vector)).toEqual(Array.from(p.store.all()[0]!.vector));
	});
});
