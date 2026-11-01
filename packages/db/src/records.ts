// Encrypted records in Neon, and the rules for syncing them with this device.
import { decryptRecord, encryptRecord } from './crypto.ts';
import type { Sql } from './sql.ts';

export interface RecordChange {
	collection: string;
	id: string;
	/** undefined means the record was deleted. */
	value?: unknown;
}

export interface PulledRecord {
	collection: string;
	id: string;
	deleted: boolean;
	value?: unknown;
	/** Server time in ms. Only ever compared with other server times. */
	updatedAt: number;
}

export async function pushRecords(
	db: Sql,
	userId: string,
	dataKey: CryptoKey,
	changes: RecordChange[]
): Promise<number> {
	let latest = 0;
	for (const c of changes) {
		const deleted = c.value === undefined;
		const ciphertext = deleted
			? null
			: await encryptRecord(dataKey, { userId, collection: c.collection, id: c.id }, c.value);
		const [row] = await db.query<{ ms: number | string }>(
			`INSERT INTO toolbelt.records (user_id, collection, id, ciphertext, deleted, updated_at)
			 VALUES ($1, $2, $3, $4, $5, clock_timestamp())
			 ON CONFLICT (user_id, collection, id)
			 DO UPDATE SET ciphertext = EXCLUDED.ciphertext, deleted = EXCLUDED.deleted, updated_at = clock_timestamp()
			 RETURNING (extract(epoch FROM updated_at) * 1000)::bigint AS ms`,
			[userId, c.collection, c.id, ciphertext, deleted]
		);
		latest = Math.max(latest, Number(row?.ms ?? 0));
	}
	return latest;
}

/** Everything changed after `since` (server ms), decrypted. Pass 0 to fetch everything. */
export async function pullRecords(db: Sql, userId: string, dataKey: CryptoKey, since = 0): Promise<PulledRecord[]> {
	const rows = await db.query<{
		collection: string;
		id: string;
		ciphertext: string | null;
		deleted: boolean;
		ms: number | string;
	}>(
		`SELECT collection, id, ciphertext, deleted, (extract(epoch FROM updated_at) * 1000)::bigint AS ms
		 FROM toolbelt.records
		 WHERE user_id = $1 AND updated_at > to_timestamp($2::double precision / 1000)
		 ORDER BY updated_at`,
		[userId, since]
	);
	const out: PulledRecord[] = [];
	for (const r of rows) {
		const value =
			r.deleted || r.ciphertext === null
				? undefined
				: await decryptRecord(dataKey, { userId, collection: r.collection, id: r.id }, r.ciphertext);
		out.push({ collection: r.collection, id: r.id, deleted: r.deleted, value, updatedAt: Number(r.ms) });
	}
	return out;
}

/**
 * Which pulled records this device should apply. A local change that has not been pushed yet wins over the
 * server (it is pushed next), so nothing typed on this device is silently overwritten.
 */
export function planPull(pulled: PulledRecord[], dirty: ReadonlySet<string>) {
	const apply: PulledRecord[] = [];
	const keptLocal: PulledRecord[] = [];
	for (const r of pulled) (dirty.has(r.id) ? keptLocal : apply).push(r);
	const since = Math.max(0, ...pulled.map((r) => r.updatedAt));
	return { apply, keptLocal, since };
}

/** Storage keys that sync. Device-only state (session, account, sync bookkeeping, last tool) stays local. */
const LOCAL_ONLY = [/^tb:session/, /^tb:account/, /^tb:sync:/, /^tb:db-url$/, /^tb:shell:last-tool$/];
export const syncsKey = (key: string) => key.startsWith('tb:') && !LOCAL_ONLY.some((r) => r.test(key));
