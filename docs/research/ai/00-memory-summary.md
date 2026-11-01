# AI memory research summary (mem0 + Neon + migrations)

Researched 2026-11-01 from primary sources: the `mem0ai@3.3.1` tarball source, mem0 docs and GitHub, Neon docs, the pgvector README, OpenAI, Gemini, Anthropic and xAI docs, the npm registry, and the source of the WXT 0.21.5 build. Details and citations: [04](./04-mem0-in-extension.md), [05](./05-neon-memory-store.md), [06](./06-migrations.md).

Pinned versions: mem0ai 3.3.1 (Apache-2.0), @neondatabase/serverless 1.2.0, pgvector on Neon 0.8.0 (PG14–17) / 0.8.6 (PG18), idb 8.0.4, @noble/hashes 2.4.0, drizzle-kit 0.31.11, drizzle-orm 0.45.4, node-pg-migrate 9.0.0.

## Recommendations

1. **Use the mem0 OSS SDK unchanged.** Import `mem0ai/oss`, pinned to exactly `3.3.1`. No fork. Do not use the root `mem0ai` export, which is the hosted `MemoryClient`.
2. **Know what v3 does.** `add()` makes one LLM call with `ADDITIVE_EXTRACTION_PROMPT` (ADD only), embeds the results, dedups by MD5 against the 10 nearest memories, links entities in a `<collection>_entities` store and writes history. `search()` is hybrid: semantic, plus a BM25 boost and an entity boost. The LLM no longer makes the paper's (arXiv:2504.19413) UPDATE/DELETE decisions, and graph memory has been removed from OSS.
3. **Plug in through the exported factories.** The TS SDK has no public provider registry. Before `new Memory()`, wrap the static `VectorStoreFactory.create`, `HistoryManagerFactory.create`, `LLMFactory.create` and `EmbedderFactory.create` to return `toolbelt` providers. `provider` is a free string and the configs are passthrough. Pin the version and add a test that proves the store is actually used.
4. **Add five build shims** (Vite aliases in the WXT config):
   - `better-sqlite3` → throwing stub;
   - `fs`/`os`/`path` → stubs;
   - `crypto` → `createHash` md5/sha1 via `@noble/hashes/legacy` plus `randomUUID` from WebCrypto;
   - every unused mem0 peer → empty module;
   - a `process` shim imported first.
   Without the `process` shim, the module fails on load (`process.env.OPENAI_API_KEY` at top level).
5. **Turn telemetry off: `process.env.MEM0_TELEMETRY = 'false'` must exist before mem0 loads.** If `process` is missing, mem0 defaults telemetry **on**. It then POSTs to PostHog and fetches a notices JSON from raw.githubusercontent.com, which conflicts with store data-disclosure rules. Add a test that spies on `fetch`.
6. **Run memory only in the background**, with typed messages from pages and content scripts.
   - mem0's built-in OpenAI/xAI/Anthropic providers construct their SDKs without `dangerouslyAllowBrowser`. That works in the Chrome service worker, which has no `window`, but **throws in Firefox's event-page background** and in any extension page.
   - So write small fetch-based `LLM`/`Embedder` adapters for OpenAI, Gemini, Anthropic and xAI. They implement mem0's interfaces and reuse doc 03's provider layer.
7. **An embedding key is mandatory.** Anthropic and xAI have no documented embedding API, so memory needs OpenAI or Gemini embeddings even when the agent uses Claude or Grok.
   - Default: OpenAI `text-embedding-3-small` at 512 dims. Fallback: `gemini-embedding-001` at 768.
   - One model per user. A model change triggers a local re-embed job.
8. **Encryption: choose design B.** Everything is encrypted with AES-GCM on device, and Neon stores only ciphertext:
   - text and payload, vectors, history, and messages;
   - an HMAC for dedup instead of mem0's MD5;
   - AAD = `user_id|id|collection|version`.
   The custom `toolbelt` `VectorStore` searches a decrypted local cache by brute force, which is cheap at a few thousand memories × 512 dims, and writes through the outbox to Neon. Neon remains the durable source of truth, and the cache can always be rebuilt. **pgvector is not needed.** Plaintext vectors in pgvector (option A) leak meaning (embedding inversion, arXiv:2310.06816). Offer A only as an explicit opt-out on a single-owner database.
9. **Neon schema** (doc 05): `toolbelt.memory_item(id, user_id, collection, key_id, iv, ciphertext, embedding_ct, embedding_model, dims, content_mac, version, created_at, updated_at, deleted_at)`, plus `memory_history`, `memory_message` and `user_key(salt, kdf params)`. Use opaque random `user_id`s.
10. **Decision needed: a shared DB with one baked connection string.** E2E protects confidentiality only. Any build holder can still delete or overwrite other users' rows. For real multi-user use, give each user their own Postgres role with RLS on `current_user`, or use product mode (Data API + RLS on the JWT).
11. **Migrations use an in-house runner** (doc 06):
    - SQL files: `packages/db/migrations/neon/NNNN_name.sql`, immutable, split on `--> statement-breakpoint`, bundled through `import.meta.glob('?raw')`, with a committed checksum lock file and a CI test.
    - Tracking table: `toolbelt._migrations(version PK, name, checksum, applied_at, applied_by)`.
    - One `sql.transaction` per migration: `pg_advisory_xact_lock(LOCK_ID)` → `SET LOCAL` timeouts → tracking INSERT first (a primary-key conflict means another device won) → statements.
    - Verify checksums. Older builds run in compatible mode. Follow expand/contract so the previous release keeps working.
12. **Do not use the drizzle neon-http migrator or node-pg-migrate at runtime.** The drizzle migrator needs `node:fs`, runs without a transaction or lock and does no checksum check. node-pg-migrate uses session locks over TCP. drizzle-kit `generate` is optional for drafting SQL.
13. **Local migrations:**
    - WXT `storage.defineItem({ version, migrations })` for `chrome.storage`;
    - `idb` `upgrade()` for IndexedDB structure (never await WebCrypto or `fetch` inside it);
    - a separate resumable data-migration step for encrypted payloads, with a schema version inside the plaintext.
    Cache stores may be dropped and re-pulled. The outbox must never be dropped.
14. **Service-worker limits:** use fast non-reasoning extraction models so each LLM response arrives within 30 s. Run `add()` as an idempotent queued job retried by `chrome.alarms`. Pull the cold cache in pages of about 1,000 rows.
15. **Licence:** mem0's code and prompts are Apache-2.0. Ship its licence text and attribution in an `OSS-LICENSES` file (the repo root has no NOTICE file) and mark any modified prompts.
16. **First spike (about 1 day):** build `apps/toolbelt` with the shims and patched factories. Run `add()`/`search()` against a Neon branch in both Chrome and Firefox. Assert there is no PostHog or GitHub traffic, and test the migration runner with two concurrent runners in PGlite.

## Main uncertainties

- The factory-patch seam relies on internal wiring of a single-file bundle. A minor mem0 release could break it.
- Whether a multi-statement SQL string works over Neon HTTP (avoided by splitting), and whether `pg_advisory_xact_lock` holds across a `sql.transaction` array (expected to, but needs a spike).
- The bundle size of `openai` 4.x plus mem0 (~0.6 MB) in the background, and whether `compromise` resolves through tsup's `__require` shim in an IIFE build.
- Whether Anthropic and Gemini CORS headers matter from an extension service worker that has host permissions (expected not to).
