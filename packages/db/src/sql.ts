// The tiny database interface everything in this package uses. Neon (over HTTP) in the extension, PGlite
// (real Postgres in WebAssembly) in tests.
import { neon } from '@neondatabase/serverless';

export interface Statement {
	text: string;
	params?: unknown[];
}

export interface Sql {
	query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
	/** Runs every statement in one transaction: all of them apply, or none. */
	transaction(statements: Statement[]): Promise<void>;
}

export function neonSql(connectionString: string): Sql {
	const sql = neon(connectionString);
	return {
		query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
		transaction: async (statements) => {
			await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])));
		}
	};
}

/** Postgres error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (e: unknown) =>
	typeof e === 'object' && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION;
