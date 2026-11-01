// The mem0 open-source SDK, wired to Toolbelt's own parts. mem0 has no public way to add a provider, but it
// builds every part through exported factories, so wrapping their `create` (before `new Memory()`) for the
// provider name 'toolbelt' hands it our store, history, LLM and embedder. mem0ai is pinned to an exact
// version and test/mem0.test.ts proves the patch is used, because this relies on how the SDK is wired inside.
import './no-telemetry.ts';
import {
	EmbedderFactory,
	HistoryManagerFactory,
	LLMFactory,
	Memory,
	VectorStoreFactory,
	type Embedder,
	type LLM
} from 'mem0ai/oss';
import type { MemoryStore } from './store.ts';

export const PROVIDER = 'toolbelt';

let patched = false;

function patchFactories() {
	if (patched) return;
	patched = true;
	const vectors = VectorStoreFactory.create.bind(VectorStoreFactory);
	const history = HistoryManagerFactory.create.bind(HistoryManagerFactory);
	const llms = LLMFactory.create.bind(LLMFactory);
	const embedders = EmbedderFactory.create.bind(EmbedderFactory);
	// Our parts travel inside mem0's own config fields that accept any value (model, client, config).
	VectorStoreFactory.create = (provider, config) =>
		provider === PROVIDER
			? (config.client as MemoryStore).vectorStore(config.collectionName ?? 'memories', config.dimension)
			: vectors(provider, config);
	HistoryManagerFactory.create = (provider, config) =>
		provider === PROVIDER ? (config.config as { store: MemoryStore }).store.historyStore() : history(provider, config);
	LLMFactory.create = (provider, config) => (provider === PROVIDER ? (config.model as LLM) : llms(provider, config));
	EmbedderFactory.create = (provider, config) =>
		provider === PROVIDER ? (config.model as Embedder) : embedders(provider, config);
}

export interface Mem0Parts {
	store: MemoryStore;
	llm: LLM;
	embedder: Embedder;
	dims: number;
	customInstructions?: string;
}

export function createMem0(parts: Mem0Parts): Memory {
	patchFactories();
	return new Memory({
		embedder: { provider: PROVIDER, config: { model: parts.embedder, embeddingDims: parts.dims } },
		llm: { provider: PROVIDER, config: { model: parts.llm } },
		vectorStore: {
			provider: PROVIDER,
			config: { client: parts.store, collectionName: 'memories', dimension: parts.dims }
		},
		historyStore: { provider: PROVIDER, config: { store: parts.store } as never },
		customInstructions: parts.customInstructions
	});
}
