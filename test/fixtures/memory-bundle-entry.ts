// Built by test/memory-bundle.test.ts the way the background is built (IIFE, shims), then run with no Node.
import '../../apps/toolbelt/shims/process.ts';
import { newDataKey } from '../../packages/db/src/crypto.ts';
import { createMem0 } from '../../packages/memory/src/mem0.ts';
import { createEmbedder, createLlm } from '../../packages/memory/src/providers.ts';
import { MemoryStore } from '../../packages/memory/src/store.ts';
import { fakeProviders, memoryArea } from '../../packages/memory/test/fakes.ts';

(globalThis as { smoke?: () => Promise<unknown> }).smoke = async () => {
	const providers = fakeProviders();
	const uploads: unknown[] = [];
	const sql = { query: async () => [], transaction: async (s: unknown[]) => void uploads.push(...s) };
	const store = new MemoryStore({
		database: async () => sql as never,
		userId: 'u1',
		key: await newDataKey(),
		model: 'openai/text-embedding-3-small@512',
		local: memoryArea()
	});
	const embedder = { provider: 'openai', model: 'text-embedding-3-small', dims: 512, id: 'x' } as const;
	const memory = createMem0({
		store,
		dims: 512,
		embedder: createEmbedder(embedder, 'sk-test', providers.fetch),
		llm: createLlm({ provider: 'openai', model: 'gpt-5-mini' }, 'sk-test', providers.fetch)
	});
	await memory.add([{ role: 'user', content: 'I am vegetarian and live in Lahore' }], { userId: 'u1' });
	const found = await memory.search('vegetarian', { filters: { user_id: 'u1' } });
	await memory.reset();
	await store.flush();
	return {
		found: found.results.map((r) => r.memory),
		uploads: uploads.length,
		urls: providers.calls.map((c) => c.url)
	};
};
