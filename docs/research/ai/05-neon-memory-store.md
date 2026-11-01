# 05: Neon as the mem0 memory store (with end-to-end encryption)

Researched 2026-11-01.

Constraints from the brief and the user:

- **Neon is the source of truth.** The local copy is a cache.
- **Several users may share one database.** Every row carries `user_id` and is encrypted with that user's own key (AES-GCM, derived from the master password).
- The mem0 OSS SDK does the memory logic (doc 04).

## 1. pgvector on Neon

- Neon's extension table (https://neon.com/docs/extensions/pg-extensions) lists `vector` **0.8.0 on PG14–17** and **0.8.6 on PG18**. Install it with `CREATE EXTENSION vector;`. The current upstream release is 0.8.7 (https://github.com/pgvector/pgvector). **Create new projects on PG18.**
- Index limits:
  - HNSW and IVFFlat: `vector` ≤ **2,000** dims, `halfvec` ≤ **4,000**, `bit` ≤ 64,000.
  - Storage: up to 16,000 dims (https://neon.com/docs/extensions/pgvector and the pgvector README).
  - For HNSW builds, `maintenance_work_mem` should cover the working set. This is irrelevant at a few thousand rows.
- Filtered ANN: pgvector 0.8 has `SET hnsw.iterative_scan = strict_order|relaxed_order`, which fixes "WHERE user_id = … returns too few rows". `hnsw.ef_search` defaults to 40.
- **Mixed dimensions:**
  - An index needs a fixed dimension.
  - Use an untyped `vector` column with **expression plus partial indexes**: `CREATE INDEX ON t USING hnsw ((embedding::vector(1536)) vector_cosine_ops) WHERE embedding_model = 'openai/text-embedding-3-small';`
  - Queries then cast the same way (pgvector README FAQ).
- 3072-dim models (`text-embedding-3-large`, Gemini at its default) exceed the 2,000-dim `vector` index limit. Use `halfvec(3072)` or request fewer dims.

## 2. Embedding providers and dimensions

| Provider | Model | Dims | Notes |
|---|---|---|---|
| OpenAI | `text-embedding-3-small` | 1536 default; `dimensions` param shortens it | About $0.02 per 1M tokens (derived from "62,500 pages per dollar" at about 800 tokens per page) (https://developers.openai.com/api/docs/guides/embeddings) |
| OpenAI | `text-embedding-3-large` | 3072 default; shortenable | |
| Gemini | `gemini-embedding-001` (text) / `gemini-embedding-2` (multimodal) | 3072 default; 128–3072, recommended 768/1536/3072 | `-001`: normalise non-3072 outputs yourself; cosine is scale-invariant, so normalisation only matters for dot product or L2. `-001` takes `task_type`; `-2` uses prompt prefixes instead (https://ai.google.dev/gemini-api/docs/embeddings). |
| Anthropic | none | none | Points to Voyage AI (`voyage-4*`: 1024 default; 256/512/2048) (https://platform.claude.com/docs/en/build-with-claude/embeddings) |
| xAI | none documented | none | https://docs.x.ai/docs/models lists no embedding models (unverified third-party mentions of `/v1/embeddings`) |

**Recommendation:**

- One embedding space per user, recorded on every row as `embedding_model` and `dims`.
- Default: OpenAI `text-embedding-3-small` at **512 dims**. Fallback: Gemini `gemini-embedding-001` at **768**.
- Small vectors keep the client-side search in §4 cheap. MRL truncation (shorter vectors from the same model) costs a little recall, which is acceptable at this scale.
- Changing model triggers a local re-embed job: decrypt, embed, re-encrypt, upload. Never mix models in one search.

## 3. The encryption tension

The core problem: **server-side vector search needs plaintext vectors, and plaintext vectors leak meaning.**

- Embedding inversion recovers much of the original text from vectors. See Morris et al., "Text Embeddings Reveal (Almost) As Much As Text", arXiv:2310.06816 (vec2text).
- Even without inversion, nearest-neighbour queries against known phrases reveal topics.
- mem0's payload also carries `hash` (MD5 of the memory text). For short facts like "User is vegetarian", MD5 can be reversed by dictionary attack.
- In a **multi-user shared DB**, a leaked connection string exposes every user's vectors. That string is baked into personal builds and is extractable from any copy of the extension.

Options:

| | A. Encrypt text, plaintext vectors in pgvector | B. Everything encrypted, search locally over a decrypted cache | C. Download encrypted vectors per query, search client-side |
|---|---|---|---|
| Server sees | vectors, `user_id`, timestamps, sizes | ciphertext, `user_id`, timestamps, sizes | same as B |
| Search runs | Neon HNSW (1 HTTP round trip) | in the background, from IndexedDB or memory | in the background after a download |
| Leak on DB breach | semantics of every memory (inversion) | none beyond metadata | none beyond metadata |
| Network per search | ~1 query (tens to a few hundred ms; a cold compute adds "a few hundred milliseconds", https://neon.com/docs/introduction/scale-to-zero) | **0** (cache hit); incremental pull on sync | the full vector set each time (bad) |
| Works offline | no | yes | no |
| Fits "Neon = source of truth" | yes | yes: Neon holds the durable ciphertext, and the cache is rebuildable by pulling and decrypting | yes |

**Recommendation: B.** It meets E2E for every user in the shared DB, and the scale makes it cheap:

- 5,000 memories × 512 float32 = 10 MB in memory (about 2.5 MB as int8).
- Brute-force cosine is 2.6 M multiply-adds per query, a few milliseconds in JS. This is an estimate, not a benchmark.
- Entity vectors add a similar amount.
- mem0's `add()` already makes ~3 + E store calls (search, insert, entity list and search per entity). Hitting a local cache instead of Neon removes 5–20 HTTP round trips per `add()`.

Keep option A as a documented **opt-out** ("fast server search, vectors not encrypted"). It is only acceptable for a single-user database the user owns. Do not offer it in shared or product mode.

## 4. Design B: a mem0 `VectorStore` named "toolbelt"

This is the custom store registered through the factory seam in doc 04. One class serves both `memories` and `memories_entities`.

- **`insert`, `update`, `delete`:**
  1. Write the plaintext to the local cache (IndexedDB plus an in-memory `Float32Array` matrix).
  2. Enqueue an outbox op (doc 06 sync).
  3. The sync job encrypts it and upserts it to Neon.
  4. Return.
- **`search`:** brute-force cosine over the in-memory matrix, filtered by `user_id`, `agent_id` and `run_id` from `filters`. mem0 passes snake_case keys in `filters`. Returns `{ id, payload, score }` with `score = cosine` (mem0 expects 0..1 similarity; the built-in PGVector uses `1 - distance`).
- **`keywordSearch`:** a small local BM25 index (e.g. MiniSearch) over `payload.textLemmatized`. If you skip it, mem0 just loses the BM25 boost (`keywordSearch` is optional).
- **`list(filters, topK)`:** returns `[rows, total]` from the cache. mem0 calls `list(filters, 10000)` on the entity store.
- **`getUserId`/`setUserId`:** return a constant. They are used only for telemetry, which is off.
- **`initialize`:** waits for the local cache. On a cold cache it pulls and decrypts all of this user's rows from Neon (`SELECT … WHERE user_id = $1 AND updated_at > $cursor`).

Store-side choices:

- **Dedup and hash:** keep mem0's MD5 `hash` **inside** the ciphertext only. For server-side idempotency use `content_mac = HMAC-SHA256(macKey, collection || normalised text)`.
- **History store "toolbelt":** `addHistory` and `saveMessages` follow the same pattern (encrypt, then the outbox). `getLastMessages` reads the local cache.

### Neon schema (lives in `packages/db/migrations/neon/0002_memory.sql`; see doc 06)

```sql
CREATE TABLE toolbelt.memory_item (
  id              uuid PRIMARY KEY,                 -- mem0 memory/entity id (uuid v4)
  user_id         text NOT NULL,                    -- owner; RLS key in product mode
  collection      text NOT NULL CHECK (collection IN ('memories','memories_entities')),
  key_id          text NOT NULL,                    -- which derived key encrypted this row (rotation)
  iv              bytea NOT NULL,                   -- 12-byte AES-GCM nonce, unique per write
  ciphertext      bytea NOT NULL,                   -- AES-GCM(JSON payload: data, textLemmatized, hash, metadata, linkedMemoryIds…)
  embedding_ct    bytea NOT NULL,                   -- AES-GCM(Float32Array bytes) — separate IV in prefix
  embedding_model text NOT NULL,                    -- e.g. 'openai/text-embedding-3-small@512'
  dims            int  NOT NULL,
  content_mac     text NOT NULL,                    -- HMAC for dedup/idempotency, not reversible without key
  version         bigint NOT NULL DEFAULT 1,        -- LWW / optimistic concurrency (doc 06 of root research)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                       -- soft delete for sync tombstones
);
CREATE INDEX memory_item_pull ON toolbelt.memory_item (user_id, updated_at);
CREATE INDEX memory_item_mac  ON toolbelt.memory_item (user_id, collection, content_mac);

CREATE TABLE toolbelt.memory_history (
  id uuid PRIMARY KEY, user_id text NOT NULL, memory_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('ADD','UPDATE','DELETE')),
  key_id text NOT NULL, iv bytea NOT NULL, ciphertext bytea NOT NULL, -- {previousValue,newValue}
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_history_mem ON toolbelt.memory_history (user_id, memory_id, created_at);

CREATE TABLE toolbelt.memory_message (                 -- mem0 saveMessages/getLastMessages
  id uuid PRIMARY KEY, user_id text NOT NULL, scope_mac text NOT NULL,
  key_id text NOT NULL, iv bytea NOT NULL, ciphertext bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_message_scope ON toolbelt.memory_message (user_id, scope_mac, created_at DESC);
```

Notes on the schema:

- Design B **does not need pgvector at all**. That avoids `CREATE EXTENSION` privilege issues for a restricted role.
- **AAD:** bind each ciphertext to `user_id | id | collection | version` through AES-GCM `additionalData`. The server or another user then cannot swap rows between owners or replay old versions undetected.
- Every write uses a fresh 96-bit IV.
- Keys:
  - Use HKDF from the master-password-derived root to get `encKey` and `macKey`.
  - Derive the root with PBKDF2-SHA256 in WebCrypto at a high iteration count, or Argon2id via WASM. Store a per-user salt in a plaintext `toolbelt.user_key(user_id, salt, kdf_params, key_check)` row.
  - The crypto design itself is out of scope here and needs its own review.
- **Shared database, personal mode:**
  - Every build that has the baked connection string can read all ciphertext, and can **delete or overwrite** other users' rows. E2E protects confidentiality, not integrity or availability. AAD detects tampering but cannot prevent deletion.
  - If several people really share one database, give each person a **separate Postgres role** with an RLS policy `user_id = current_user`.
  - Better still, use product mode (Neon Data API + RLS on the JWT `sub`, root doc 06).
  - Flag this to the user as a decision.
- Metadata still leaks: row counts, sizes and timing per `user_id`. Use an opaque random `user_id` rather than an email.

### Option A schema (opt-out only, single-owner database)

Add `embedding vector NOT NULL` (untyped) next to the encrypted payload. Add one partial expression HNSW index per model:

```sql
CREATE INDEX ON toolbelt.memory_item USING hnsw ((embedding::vector(512)) vector_cosine_ops)
  WHERE embedding_model = 'openai/text-embedding-3-small@512';
```

Query with `SET LOCAL hnsw.iterative_scan = relaxed_order` inside `sql.transaction`, and `ORDER BY embedding::vector(512) <=> $1 LIMIT $k`. Even here, keep `ciphertext` for the text.

## 5. Cost and latency from the background (personal mode, `neon()` over HTTP)

- Each `sql` call is one HTTPS `fetch`, and `sql.transaction([...])` is one fetch for N statements. The request and response limit is **64 MB** (https://neon.com/docs/serverless/serverless-driver).
- Design B network:
  - Search: none.
  - Write: one batched upsert per sync tick.
  - Cold start: a full pull. 5,000 rows × (512 × 4 B + ~1 KB text) ≈ 15 MB. Split it into pages of about 1,000 rows to stay under 30 s per fetch.
- Neon free-tier computes scale to zero after 5 minutes and wake in "a few hundred milliseconds". Design B hides this, because nothing user-facing waits on Neon.
- LLM and embedding costs dominate. Per `add()`: one extraction call, plus one embed of the turn, one batch embed of the new memories and one batch embed of the entities.

## Open questions

- Encrypted int8-quantised vectors would cut cache and pull size by 4x. This is untested with mem0's 0.95 entity-match threshold.
- In Firefox the background is an event page and is unloaded when idle, the same as in Chrome. The in-memory matrix must be rebuilt from IndexedDB on wake: about 10 MB read, likely tens of ms (unmeasured).
