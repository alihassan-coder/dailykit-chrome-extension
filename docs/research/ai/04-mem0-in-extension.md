# 04: Running the mem0 OSS SDK inside the extension

Researched 2026-11-01. The user requires the **open-source mem0 SDK** (`mem0ai` npm, `mem0ai/oss` import). This doc says how to make that SDK run in Toolbelt's background with Neon as the store. It does not cover the hosted platform or a rewrite.

Versions inspected (npm registry, tarball read directly):

- `mem0ai` **3.3.1** (published 2026-09-25, GitHub tag `ts-v3.3.1`). Licence **Apache-2.0**.
- Hard deps: `openai ^4.93.0` (resolves to 4.104.0), `zod ^3.24.1`, `uuid ^11.1.1`, `axios ^1.18.0`.
- About 40 optional peers (`pg`, `better-sqlite3`, `@anthropic-ai/sdk ^0.40.1`, `@google/genai ^1.40.0`, `@qdrant/...`, and others).
- The peer range `@anthropic-ai/sdk ^0.40.1` admits only **0.40.1**, because `^` on a 0.x version pins the minor. The current Anthropic SDK is 1.3.0. `@google/genai ^1.40.0` resolves to 1.52.0, while the current release is 2.32.0. The SDK expects old client libraries.
- Source: `dist/oss/index.mjs` in the tarball (one 607 KB ESM file built by tsup, see `mem0-ts/tsup.config.ts`) and https://github.com/mem0ai/mem0/tree/main/mem0-ts.

Line numbers below refer to `mem0ai@3.3.1/dist/oss/index.mjs`.

## 1. What the SDK does internally (v3)

v3 changed the algorithm. The two-call ADD/UPDATE/DELETE/NONE pipeline described in the Mem0 paper (Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory", arXiv:2504.19413) is **no longer** what OSS `add()` does. The migration guide (https://docs.mem0.ai/migration/oss-v2-to-v3) and the source both confirm this.

### `add(messages, { filters: { user_id } })`

Source: `addToVectorStore`, around line 17479.

1. Embeds the whole new conversation turn. Calls `vectorStore.search(embedding, 10, filters)` to fetch the 10 most similar existing memories.
2. Fetches up to 10 recent messages for this session scope with `historyStore.getLastMessages?()`.
3. Makes **one LLM call**:
   - System prompt: `ADDITIVE_EXTRACTION_PROMPT` (line 5415), which says "Your sole operation is ADD". Agent-scoped calls get a suffix.
   - User prompt: built by `generateAdditiveExtractionPrompt` from existing memories, new messages, the last messages and `customInstructions`.
   - Uses `response_format: json_object`.
   - The response is parsed with `AdditiveExtractionSchema`: `{ memory: [{ id, text, attributed_to?, linked_memory_ids? }] }`.
4. Calls `embedBatch` on the new memory texts.
5. Dedups by **MD5 of the text**: `createHash("md5")` from Node `crypto`, compared against the hashes of the 10 retrieved memories.
6. Builds a payload `{ ...metadata, data, textLemmatized, hash, createdAt, updatedAt, user_id, ... }` and calls `vectorStore.insert(vectors, ids, payloads)`.
7. Writes one `ADD` row per memory with `historyStore.addHistory` (or `batchAddHistory`).
8. **Entity linking** replaces graph memory:
   - Entities are extracted locally, by the `compromise` library if it is present, otherwise by heuristics.
   - Each entity is embedded and upserted into a second collection, `<collection>_entities`, with payload `{ data, entityType, linkedMemoryIds[] }`.
   - Matching is exact by text, or by semantic match with score ≥ 0.95.
   - This step calls `entityStore.list(filters, 10000)`, then a search per entity.
9. Saves the raw messages with `historyStore.saveMessages?()`.

`update()` and `delete()` still exist as explicit API calls. They write `UPDATE` and `DELETE` history rows. The LLM never decides to update or delete.

### `search(query, { filters, topK = 20, threshold = 0.1 })`

Source: around line 17875. The search is hybrid:

- **Semantic:** `vectorStore.search(embedding, max(topK*4, 60))`.
- **BM25 boost:** optional `vectorStore.keywordSearch(lemmatizedQuery)`.
- **Entity boost:** embeds the entities found in the query and searches the entity store with up to 500 candidates each.
- The signals are fused by `scoreAndRank`. An optional reranker runs last.
- BM25 and entity scores only boost results. They never add candidates.

### Graph memory

Graph memory has been **removed from OSS** and is now platform-only (migration guide). There is no `graph_store` config any more.

### History store

The `HistoryManager` interface (`index.d.ts` line 2585):

```ts
addHistory(memoryId, previousValue, newValue, action, createdAt?, updatedAt?, isDeleted?)
getHistory(memoryId)
reset()
close()
saveMessages?(messages, sessionScope)       // optional
getLastMessages?(sessionScope, limit?)      // optional
batchAddHistory?                            // optional
```

Built-in implementations: `sqlite` (better-sqlite3), `supabase` and `memory`. The SQLite schema has `memory_history(memory_id, previous_value, new_value, action, created_at, updated_at, is_deleted)` and `messages(id, session_scope, role, content, name, created_at)`. Both tables store **plaintext**.

### Prompt and code licence

Everything is in the `mem0ai/mem0` repo, which is Apache-2.0 (GitHub API `license.spdx_id`). That includes the prompts in `mem0-ts/src/oss/src/prompts/index.ts`. Using or bundling the SDK, or copying its prompts, requires:

- keeping the licence text and attribution in the shipped extension (an `OSS-LICENSES` file);
- stating any changes you make.

There is no copyleft.

## 2. Pluggable interfaces

Interfaces from `index.d.ts`:

```ts
interface VectorStore {
  insert(vectors: number[][], ids: string[], payloads: Record<string, any>[]): Promise<void>;
  search(query: number[], topK?: number, filters?: SearchFilters): Promise<VectorStoreResult[]>;
  keywordSearch?(query: string, topK?: number, filters?: SearchFilters): Promise<VectorStoreResult[] | null>;
  get(id: string): Promise<VectorStoreResult | null>;
  update(id: string, vector: number[], payload: Record<string, any>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteCol(): Promise<void>;
  list(filters?: SearchFilters, topK?: number): Promise<[VectorStoreResult[], number]>;
  getUserId(): Promise<string>;     // used only for telemetry id
  setUserId(id: string): Promise<void>;
  initialize(): Promise<void>;
}
interface Embedder { embed(text, action?): Promise<number[]>; embedBatch(texts, action?): Promise<number[][]>; }
interface LLM { generateResponse(messages, responseFormat?, tools?): Promise<any>; generateChat(messages): Promise<LLMResponse>; }
```

**There is no public "register a custom provider" API in TS.** Several things are fixed:

- `Memory` builds every component from a provider string through static factories: `EmbedderFactory`, `LLMFactory`, `VectorStoreFactory`, `HistoryManagerFactory` and `RerankerFactory` (line 14272).
- `vectorStore`, `db`, `llm` and `embedder` are `private` in the typings.
- The vector store is built inside the async `_autoInitialize()`, which the constructor starts, so you cannot simply assign one after construction.
- The Python SDK has `LlmFactory.register_provider`, but issue #7625 reports even that as broken.

**Workable seam (verified against the code):**

- All five factories are **exported** from `mem0ai/oss`.
- They are plain classes with a `static create(provider, config)`.
- Because the SDK ships as a single ESM file, `Memory` calls the same class object you import.
- So you can wrap the static method **before** calling `new Memory()`:

```ts
import { Memory, VectorStoreFactory, HistoryManagerFactory, LLMFactory, EmbedderFactory } from 'mem0ai/oss';
const origVS = VectorStoreFactory.create;
VectorStoreFactory.create = (p, c) => p === 'toolbelt' ? new ToolbeltVectorStore(c) : origVS(p, c);
// same for HistoryManagerFactory / LLMFactory / EmbedderFactory
```

How the config passes through:

- `MemoryConfigSchema` accepts any `provider: z.string()`.
- `vectorStore.config` and `llm.config` are `.passthrough()`, so extra fields reach your class unchanged.
- `historyStore.config` is `z.record(...)`.

How the entity store gets its config:

- `getEntityStore()` calls `VectorStoreFactory.create(sameProvider, { ...config, collectionName: '<name>_entities' })`.
- Your store must therefore handle two collection names.

Risks of this seam:

- It depends on internal wiring, not on a documented API.
- **Pin `mem0ai` to an exact version (`3.3.1`)**.
- Keep a unit test that asserts `new Memory({ vectorStore: { provider: 'toolbelt' } })` actually calls your store.

### The built-in `pgvector` provider does not fit

The built-in `pgvector` store (`PGVector`, line 6941) has several problems for Toolbelt:

- It runs `await import("pg")` and opens a **TCP** `Client`, which is impossible from a browser.
- On initialisation it runs `CREATE EXTENSION`, `CREATE TABLE memory_migrations` and `CREATE TABLE <collection>`. This clashes with the migration runner in doc 06.
- It lists tables from `information_schema` in schema `public` only.
- It creates the table with `vector(${Math.floor(config.embeddingModelDims)})`. `Memory` passes `dimension`, not `embeddingModelDims`, so unless you also set `embeddingModelDims` you get `vector(NaN)`. This is probably a bug, unverified at runtime.
- Payloads are **plaintext JSONB**: memory text, lemmas and an MD5 hash.

You could alias `pg` to a shim around `@neondatabase/serverless` `neon()`. It needs only `connect()`, `query(text, params)` returning `{ rows }` via `sql.query(text, params, { fullResults: true })`, and `end()`. That only makes sense for the non-E2E option, and it still hits the DDL and `vector(NaN)` problems. **A custom store is the better seam.** See doc 05.

## 3. Can it run in an MV3 service worker or extension page?

WXT 0.21.5 builds the background in Vite **lib mode, `formats: ["iife"]`** (`wxt/dist/internal/builders/vite/index.mjs` lines 143–172). An IIFE build inlines dynamic `import()`s. That helps, because MV3 service workers reject runtime `import()`. It also means every specifier the SDK imports must resolve at build time.

### Blockers found in the source, and the smallest fix for each

| # | Problem in `mem0ai@3.3.1/dist/oss/index.mjs` | Effect in the extension | Smallest fix (still the SDK) |
|---|---|---|---|
| 1 | Top-level `import Database from "better-sqlite3"` (lines 783 and 4848) | The peer is not installed, so the build fails to resolve it. It is a native module in any case. | Vite `resolve.alias`: `better-sqlite3` → stub module whose `default` class throws on construction. Never select the `memory` or `sqlite` providers. |
| 2 | Top-level `import fs/os/path` (lines 784–790, 1865, 14838–14840) | Vite replaces Node built-ins with `__vite-browser-external`, so any property access throws at runtime. They are used only by SQLite, Qdrant and the notices code. | Alias `fs`, `os` and `path` to tiny stubs (`existsSync: () => false`, no-op `mkdirSync`/`writeFileSync`, `homedir: () => '/'`, `join: (...a) => a.join('/')`, `dirname`). |
| 3 | `import { createHash, randomUUID } from "crypto"` (lines 10, 4849, 14837). `createHash("md5")` runs on **every** `add()`/`update()`; `sha1` is used in notices. | `add()` throws. WebCrypto has no MD5. | Alias `crypto` to a shim. `createHash(alg)` returns `{ update(s){…; return this}, digest('hex') }` built on `@noble/hashes/legacy` (`md5`, `sha1`; current 2.4.0). `randomUUID = () => globalThis.crypto.randomUUID()`. |
| 4 | Top-level `process.env.OPENAI_API_KEY` in `DEFAULT_MEMORY_CONFIG` (line 14508), plus `process.env.*` in the provider constructors | `ReferenceError: process is not defined` **when the module loads** | A `process-shim.ts` imported **first** in the background entry: `globalThis.process ??= { env: { MEM0_TELEMETRY: 'false' }, versions: {}, cwd: () => '/', pid: 0, stderr: { write() {} } }`. |
| 5 | **Telemetry on by default.** `MEM0_TELEMETRY` is read from `process.env` when the module loads, inside `try{}`. If `process` is missing, the `catch` leaves it **`true`**. It POSTs to PostHog `https://us.i.posthog.com/i/v0/e/` (always for `init`, sampled at 10% otherwise). The notices system also fetches `https://raw.githubusercontent.com/mem0ai/mem0/main/mem0/memory/oss_notices_config.json`. | Undisclosed third-party network calls from the extension. This violates CWS user-data disclosure and Firefox `data_collection_permissions`. | The shim in #4 **must** set `MEM0_TELEMETRY: 'false'`. Every notice path checks `isTelemetryEnabled()` first (lines 15041 onward), so this disables both. Defence in depth: do not grant host permission for `posthog.com` or `githubusercontent.com`. |
| 6 | Dynamic `import()` of ~35 unused peers (`@aws-sdk/*`, `@google-cloud/aiplatform`, `@huggingface/transformers`, `@langchain/core`, …) and providers loaded through `loadPeer` | Vite/Rollup fails on unresolved imports | A small Vite plugin with `resolveId` that maps every `mem0ai` peer you do not use to an empty virtual module. Install only the peers you do use. |
| 7 | `__require("compromise")` and `__require("natural")` guarded by `try` (lines 16082, 16440) | Silently falls back to built-in heuristics. No error. | None needed. Optionally install `compromise` for better entity extraction (it is pure JS). Unverified that the tsup `__require` shim resolves it in an IIFE bundle. |
| 8 | Built-in OpenAI/xAI/Azure LLMs and embedders call `new OpenAI({ apiKey, baseURL })` (openai 4.104.0). Anthropic calls `new Anthropic({ apiKey })` (0.40.1). **Neither passes `dangerouslyAllowBrowser`.** Both SDKs throw "It looks like you're running in a browser-like environment" when `typeof window !== 'undefined' && window.document && navigator` (openai `core.mjs` line 873; anthropic `index.mjs` line 36). | **Chrome MV3 service worker: works**, because there is no `window`. **Firefox MV3 background is an event page with `window`: it throws.** Extension pages and offscreen documents also throw. Anthropic without `dangerouslyAllowBrowser` also omits the `anthropic-dangerous-direct-browser-access` header. Extension host permissions should make CORS moot (unverified for Anthropic). | Register your own `LLM` and `Embedder` adapters through the patched `LLMFactory`/`EmbedderFactory` (provider `toolbelt`). Each adapter is about 40 lines of `fetch` per provider and works identically in the Chrome SW and the Firefox event page. They can reuse the provider layer from doc 03. Option: in Chrome only, keep the built-in `openai`/`xai`/`gemini` providers. |
| 9 | Service-worker lifetime: a `fetch` whose response takes more than 30 s kills the worker (doc 06). Each `add()` makes one LLM call plus embedding calls. | Slow (reasoning) models can exceed 30 s | Use fast non-reasoning extraction models (e.g. gpt-5-mini, which is the mem0 default, Gemini Flash, Haiku-class, or `grok-4.3`). Run `add()` from a queued job that is idempotent (dedup on HMAC, see doc 05) and retried by `chrome.alarms`. |

Notes:

- `uuid` v11 (`crypto.getRandomValues`), `zod` and `@google/genai` (it has a browser build) are fine in both contexts.
- `axios` is only reached by the Databricks store.
- The `openai` 4.x hard dep gets bundled even if unused. That is about 100–200 KB, acceptable in a background script. Unverified size.

**Import path:** use `mem0ai/oss`, which is the OSS `Memory`. The root `mem0ai` export is the hosted-platform `MemoryClient`; do not use it. There is no browser-specific entry.

**Where to run it:** run it in the **background only** (Chrome SW, Firefox event page). Running there:

- keeps API keys and the Neon string out of pages (doc 06, boundary rule 4);
- avoids the pages' DOM-context SDK guards.

Content scripts and the side panel send typed messages such as `memory.search` and `memory.add`.

### Fixes 1–6 in the WXT config, as a sketch (not app code to commit as-is)

```ts
// apps/*/wxt.config.ts → vite: () => ({ resolve: { alias: {
//   'better-sqlite3': '@toolbelt/memory/shims/better-sqlite3',
//   fs: '@toolbelt/memory/shims/fs', os: ..., path: ..., crypto: '@toolbelt/memory/shims/crypto',
// } }, plugins: [mem0UnusedPeers()] })
```

Caveat: a global `crypto`/`path` alias affects every dependency in that build. Only the background imports mem0, but WXT builds each entry with the same Vite config. Check that no other dependency expects real Node `crypto`.

## 4. Provider configs for the user's keys

| User key | LLM for extraction | Embedder |
|---|---|---|
| OpenAI | built-in `openai` (model `gpt-5-mini`) or adapter | built-in `openai`, `text-embedding-3-small` (1536 by default; `embeddingDims` → `dimensions`, e.g. 512 or 768) |
| Gemini | built-in `gemini`/`google`. Caveat: its `formatContents` maps the system role to `"model"`, which is odd and may cost quality, so an adapter is better. | built-in `gemini`, model `gemini-embedding-001`, `embeddingDims` → `outputDimensionality` (128–3072, recommended 768/1536/3072). mem0 does not support `gemini-embedding-2`'s prompt-prefix task style. |
| Anthropic | built-in `anthropic` (peer pinned to 0.40.1; works in the Chrome SW; ignores `response_format`, and mem0's `extractJson` handles fenced JSON) or adapter | **None.** "Anthropic does not offer its own embedding model" (https://platform.claude.com/docs/en/build-with-claude/embeddings). Voyage AI is suggested. |
| xAI | built-in `xai` (OpenAI-compatible, `https://api.x.ai/v1`, default `grok-4.3`) | **Not documented.** https://docs.x.ai/docs/models lists only Text, Imagine and Voice models. Third-party clients mention `POST /v1/embeddings`, which is unverified. |

**Consequence:** an embedding key (OpenAI or Gemini) is **required** for memory, even if the agent itself runs on Claude or Grok. The other option is a local embedder:

- a custom `Embedder` using transformers.js in an offscreen document (Chrome) or the event page (Firefox);
- unverified in an MV3 SW (WASM is allowed, the WebGPU path is not);
- mem0's `huggingface` embedder is the HF Inference API, not local.

Fix **one embedding model per memory space**. Switching models means re-embedding everything; see doc 05.

## 5. The hosted alternative (not chosen)

The root `mem0ai` export is `MemoryClient` for the hosted platform (`api.mem0.ai`). It needs a mem0 API key, and memory text is processed and stored on mem0's servers. That breaks end-to-end encryption and the user's requirement. Graph memory and the timestamp, decay and temporal features are platform-only (the SDK throws "not supported by the OSS Memory SDK"). This option is excluded by the user.

## Conclusion

- **Use `mem0ai@3.3.1` OSS as-is, pinned exactly.** Do not fork it.
- Add five small shims: `process` with telemetry off, `crypto` (MD5/SHA-1), `fs`/`os`/`path`, `better-sqlite3`, and the unused peers.
- Patch the factories to register `toolbelt` providers for:
  - `VectorStore`, covering both the `memories` and `memories_entities` collections;
  - `HistoryManager`, including `saveMessages`/`getLastMessages`;
  - `LLM` and `Embedder` adapters.
- Run it only in the background.
- Spike first, before building on this. A 1-day spike in `apps/toolbelt` should:
  - build with these aliases;
  - call `add()` and `search()` in Chrome and Firefox;
  - assert no request goes to posthog or githubusercontent, checked with a `fetch` spy in tests.
