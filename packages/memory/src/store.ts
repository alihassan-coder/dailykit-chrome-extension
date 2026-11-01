// Where mem0's memories live: a decrypted copy in the background's memory for search, and the user's Neon
// database as the durable copy. Neon only ever receives ciphertext, in the same `toolbelt.records` table and
// with the same encryption (the user's data key, bound to user, collection and id) as the rest of Toolbelt.
//
// mem0 talks to this through two small adapters: `vectorStore()` (one per mem0 collection: the memories and
// their entities) and `historyStore()`. Writes land in the local copy at once and go to Neon on `flush()`;
// anything not yet uploaded waits, already encrypted, in a device-only outbox and is retried later.
import { decryptRecord, encryptRecord, type KeyValue, type Sql } from '@toolbelt/db';
import type { HistoryManagerFactory, SearchFilters, VectorStore, VectorStoreResult } from 'mem0ai/oss';
import { bm25, cosine, matchesFilters, packVector, unpackVector } from './vectors.ts';

/** mem0 collection → record collection in Neon. Every memory collection starts with "memory". */
export const COLLECTIONS: Record<string, string> = {
	memories: 'memory',
	memories_entities: 'memory-entity'
};
export const HISTORY = 'memory-history';
const OUTBOX_KEY = 'tb:sync:memory-outbox';
const PAGE = 1000;

type Payload = Record<string, unknown>;
/** mem0 does not export this interface, only the factory that returns it. */
type HistoryManager = ReturnType<typeof HistoryManagerFactory.create>;

/** What one encrypted memory or entity record holds. */
interface StoredVector {
	v: 1;
	/** Embedding model, e.g. "openai/text-embedding-3-small@512". Vectors from other models are never compared. */
	model: string;
	vector: string;
	payload: Payload;
}

interface HistoryEvent {
	id: string;
	memory_id: string;
	previous_value: string | null;
	new_value: string | null;
	action: string;
	created_at: string;
	updated_at: string | null;
	is_deleted: number;
}

export interface Entry {
	id: string;
	vector: Float32Array;
	payload: Payload;
	model: string;
}

interface Cursor {
	ts: string;
	collection: string;
	id: string;
}

export interface StoreOptions {
	database: () => Promise<Sql>;
	userId: string;
	key: CryptoKey;
	/** Current embedding model id; memories from another model are kept but left out of search. */
	model: string;
	/** Device storage for the outbox (ciphertext only). */
	local: KeyValue;
}

type Outbox = Record<string, Record<string, string | null>>;

export class MemoryStore {
	readonly userId: string;
	model: string;
	private readonly opts: StoreOptions;
	private readonly entries = new Map<string, Map<string, Entry>>();
	private readonly history = new Map<string, HistoryEvent[]>();
	/** Changed locally, not yet in the outbox: `${collection}/${id}` → value (undefined = deleted). */
	private readonly pending = new Map<string, unknown>();
	private cursor: Cursor | null = null;
	private loading: Promise<void> | null = null;

	constructor(opts: StoreOptions) {
		this.opts = opts;
		this.userId = opts.userId;
		this.model = opts.model;
	}

	/** Downloads and decrypts everything once (the cold start), then only what changed. */
	ready(): Promise<void> {
		this.loading ??= this.pull().catch((e) => {
			this.loading = null;
			throw e;
		});
		return this.loading;
	}

	/** Picks up changes from other devices. */
	async refresh(): Promise<void> {
		if (!this.loading) return this.ready();
		await this.loading;
		await this.pull();
	}

	private async pull(): Promise<void> {
		const sql = await this.opts.database();
		const waiting = new Set([...this.pending.keys(), ...Object.keys(await this.outbox())]);
		for (;;) {
			const c = this.cursor;
			const rows = await sql.query<{ collection: string; id: string; ciphertext: string | null; ts: string }>(
				`SELECT collection, id, CASE WHEN deleted THEN NULL ELSE ciphertext END AS ciphertext, updated_at::text AS ts
				 FROM toolbelt.records
				 WHERE user_id = $1 AND (collection = 'memory' OR collection LIKE 'memory-%')
				   AND ($2::timestamptz IS NULL OR (updated_at, collection, id) > ($2::timestamptz, $3::text, $4::text))
				 ORDER BY updated_at, collection, id
				 LIMIT ${PAGE}`,
				[this.userId, c?.ts ?? null, c?.collection ?? '', c?.id ?? '']
			);
			for (const r of rows) {
				// A change made here and not uploaded yet wins; it is uploaded next.
				if (waiting.has(`${r.collection}/${r.id}`)) continue;
				const value =
					r.ciphertext === null
						? undefined
						: await decryptRecord(
								this.opts.key,
								{ userId: this.userId, collection: r.collection, id: r.id },
								r.ciphertext
							);
				this.apply(r.collection, r.id, value);
			}
			const last = rows.at(-1);
			if (last) this.cursor = { ts: last.ts, collection: last.collection, id: last.id };
			if (rows.length < PAGE) return;
		}
	}

	private apply(collection: string, id: string, value: unknown) {
		if (collection === HISTORY) {
			if (value === undefined) this.history.delete(id);
			else this.history.set(id, (value as { events: HistoryEvent[] }).events);
			return;
		}
		const map = this.collection(collection);
		if (value === undefined) {
			map.delete(id);
			return;
		}
		const stored = value as StoredVector;
		map.set(id, { id, vector: unpackVector(stored.vector), payload: stored.payload, model: stored.model });
	}

	private collection(name: string): Map<string, Entry> {
		let map = this.entries.get(name);
		if (!map) this.entries.set(name, (map = new Map()));
		return map;
	}

	private write(collection: string, id: string, value: unknown) {
		this.apply(collection, id, value);
		this.pending.set(`${collection}/${id}`, value);
	}

	/** Every memory (or entity), including ones from another embedding model. */
	all(collection = COLLECTIONS.memories!): Entry[] {
		return [...this.collection(collection).values()];
	}

	// ---- upload ----

	private async outbox(): Promise<Record<string, string | null>> {
		const all = ((await this.opts.local.get(OUTBOX_KEY))[OUTBOX_KEY] ?? {}) as Outbox;
		return all[this.userId] ?? {};
	}

	private async saveOutbox(mine: Record<string, string | null>) {
		const all = ((await this.opts.local.get(OUTBOX_KEY))[OUTBOX_KEY] ?? {}) as Outbox;
		if (Object.keys(mine).length) all[this.userId] = mine;
		else delete all[this.userId];
		await this.opts.local.set({ [OUTBOX_KEY]: all });
	}

	/** Encrypts what changed, keeps it in the outbox, and uploads the outbox in one transaction. */
	async flush(): Promise<void> {
		const box = await this.outbox();
		if (this.pending.size) {
			for (const [address, value] of this.pending) {
				const slash = address.indexOf('/');
				const collection = address.slice(0, slash);
				const id = address.slice(slash + 1);
				box[address] =
					value === undefined
						? null
						: await encryptRecord(this.opts.key, { userId: this.userId, collection, id }, value);
			}
			this.pending.clear();
			await this.saveOutbox(box);
		}
		const sent = Object.entries(box);
		if (!sent.length) return;
		const sql = await this.opts.database();
		await sql.transaction(
			sent.map(([address, ciphertext]) => {
				const slash = address.indexOf('/');
				return {
					text: `INSERT INTO toolbelt.records (user_id, collection, id, ciphertext, deleted, updated_at)
					       VALUES ($1, $2, $3, $4, $5, clock_timestamp())
					       ON CONFLICT (user_id, collection, id) DO UPDATE
					       SET ciphertext = EXCLUDED.ciphertext, deleted = EXCLUDED.deleted, updated_at = clock_timestamp()`,
					params: [this.userId, address.slice(0, slash), address.slice(slash + 1), ciphertext, ciphertext === null]
				};
			})
		);
		// Anything that changed again while uploading stays for the next round.
		const after = await this.outbox();
		for (const [address, ciphertext] of sent) if (after[address] === ciphertext) delete after[address];
		await this.saveOutbox(after);
	}

	// ---- mem0 adapters ----

	/** mem0's VectorStore for one collection ("memories" or "memories_entities"). */
	vectorStore(mem0Collection: string, dimension?: number): VectorStore {
		const name = COLLECTIONS[mem0Collection];
		if (!name) throw new Error(`Unknown memory collection: ${mem0Collection}`);
		const usable = (filters?: SearchFilters) =>
			this.all(name).filter((e) => e.model === this.model && matchesFilters(e.payload, filters));
		const result = (e: Entry, score?: number): VectorStoreResult => ({
			id: e.id,
			payload: structuredClone(e.payload),
			...(score === undefined ? {} : { score })
		});
		const check = (v: number[]) => {
			if (dimension && v.length !== dimension)
				throw new Error(`Vector dimension mismatch. Expected ${dimension}, got ${v.length}`);
		};
		const put = (id: string, vector: number[], payload: Payload) => {
			check(vector);
			const stored: StoredVector = { v: 1, model: this.model, vector: packVector(vector), payload };
			this.write(name, id, stored);
		};

		return {
			initialize: () => this.ready(),
			insert: async (vectors, ids, payloads) => {
				vectors.forEach((v, i) => put(ids[i]!, v, payloads[i] ?? {}));
			},
			search: async (query, topK = 10, filters) => {
				check(query);
				return usable(filters)
					.map((e) => ({ e, score: cosine(query, e.vector) }))
					.sort((a, b) => b.score - a.score)
					.slice(0, topK)
					.map(({ e, score }) => result(e, score));
			},
			keywordSearch: async (query, topK = 10, filters) =>
				bm25(
					query,
					usable(filters).map((e) => ({ item: e, text: String(e.payload.textLemmatized ?? e.payload.data ?? '') }))
				)
					.slice(0, topK)
					.map(({ item, score }) => result(item, score)),
			get: async (id) => {
				const e = this.collection(name).get(id);
				return e ? result(e) : null;
			},
			update: async (id, vector, payload) => put(id, vector, payload),
			delete: async (id) => this.write(name, id, undefined),
			deleteCol: async () => {
				for (const id of [...this.collection(name).keys()]) this.write(name, id, undefined);
			},
			list: async (filters, topK = 100) => {
				const rows = usable(filters);
				return [rows.slice(0, topK).map((e) => result(e)), rows.length];
			},
			// Only used by mem0's telemetry, which is off.
			getUserId: async () => 'toolbelt',
			setUserId: async () => {}
		};
	}

	/** mem0's history of each memory (added, updated, deleted), stored as one record per memory. */
	historyStore(): HistoryManager {
		const add = (memoryId: string, event: Omit<HistoryEvent, 'id' | 'memory_id'>) => {
			const events = [
				...(this.history.get(memoryId) ?? []),
				{ id: crypto.randomUUID(), memory_id: memoryId, ...event }
			];
			this.write(HISTORY, memoryId, { v: 1, events });
		};
		const event = (
			previousValue: string | null,
			newValue: string | null,
			action: string,
			createdAt?: string,
			updatedAt?: string,
			isDeleted = 0
		) => ({
			previous_value: previousValue,
			new_value: newValue,
			action,
			created_at: createdAt ?? new Date().toISOString(),
			updated_at: updatedAt ?? null,
			is_deleted: isDeleted
		});
		// Raw chat turns stay in this background only (mem0 reads the last few as context); they are never uploaded.
		const messages = new Map<string, { role: string; content: string; name?: string; createdAt: string }[]>();

		return {
			addHistory: async (memoryId, previousValue, newValue, action, createdAt, updatedAt, isDeleted) =>
				add(memoryId, event(previousValue, newValue, action, createdAt, updatedAt, isDeleted)),
			batchAddHistory: async (records) => {
				for (const r of records)
					add(r.memoryId, event(r.previousValue, r.newValue, r.action, r.createdAt, r.updatedAt, r.isDeleted));
			},
			getHistory: async (memoryId) =>
				[...(this.history.get(memoryId) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100),
			reset: async () => {
				for (const id of [...this.history.keys()]) this.write(HISTORY, id, undefined);
				messages.clear();
			},
			close: () => {},
			saveMessages: async (turns, scope) => {
				const list = messages.get(scope) ?? [];
				list.push(...turns.map((t) => ({ ...t, createdAt: new Date().toISOString() })));
				messages.set(scope, list.slice(-20));
			},
			getLastMessages: async (scope, limit = 10) => (messages.get(scope) ?? []).slice(-limit)
		};
	}
}
