// Real Postgres (PGlite, in WebAssembly) behind the same Sql interface the extension uses with Neon.
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from '../src/sql.ts';

export async function testDatabase(): Promise<Sql & { close(): Promise<void> }> {
	const db = new PGlite();
	await db.waitReady;
	return {
		query: async <T>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows,
		transaction: async (statements) => {
			await db.transaction(async (tx) => {
				for (const s of statements) await tx.query(s.text, s.params ?? []);
			});
		},
		close: () => db.close()
	};
}
