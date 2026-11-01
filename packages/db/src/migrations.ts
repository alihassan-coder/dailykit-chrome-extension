// Runs numbered SQL migrations against the user's Neon database, from the extension, with no server.
// Safe with several devices: each migration runs in one transaction behind an advisory lock, and the
// tracking row is inserted first, so a second device racing the same migration rolls back cleanly.
import { isUniqueViolation, type Sql } from './sql.ts';
import accountsAndRecords from '../migrations/neon/0001_accounts_and_records.sql?raw';

export interface Migration {
	version: number;
	name: string;
	sql: string;
}

/** Every migration this build knows, oldest first. Shipped entries never change. */
export const MIGRATIONS: Migration[] = [{ version: 1, name: 'accounts_and_records', sql: accountsAndRecords }];

const LOCK_ID = 7_340_012; // any constant; only Toolbelt's migration runner takes this advisory lock

export class MigrationError extends Error {}

export type MigrationResult =
	| { status: 'up-to-date'; version: number; applied: number[] }
	/** The database was migrated by a newer build. Keep working; do not touch the schema. */
	| { status: 'newer-schema'; version: number; applied: number[] };

export async function checksum(sql: string): Promise<string> {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sql));
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const statementsOf = (sql: string) =>
	sql
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.filter((s) => s.replace(/--.*$/gm, '').trim());

export async function runMigrations(db: Sql, migrations: Migration[] = MIGRATIONS): Promise<MigrationResult> {
	await db.query('CREATE SCHEMA IF NOT EXISTS toolbelt');
	await db.query(`CREATE TABLE IF NOT EXISTS toolbelt._migrations (
		version integer PRIMARY KEY,
		name text NOT NULL,
		checksum text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`);

	const known = new Map(migrations.map((m) => [m.version, m]));
	const appliedNow: number[] = [];

	const readApplied = () =>
		db.query<{ version: number; checksum: string }>(
			'SELECT version, checksum FROM toolbelt._migrations ORDER BY version'
		);

	let applied = await readApplied();
	for (const row of applied) {
		const m = known.get(row.version);
		if (m && (await checksum(m.sql)) !== row.checksum) {
			throw new MigrationError(
				`Migration ${row.version} (${m.name}) was changed after it ran. Add a new migration instead.`
			);
		}
	}

	const latestKnown = Math.max(0, ...migrations.map((m) => m.version));
	const latestApplied = Math.max(0, ...applied.map((r) => r.version));
	if (latestApplied > latestKnown) return { status: 'newer-schema', version: latestApplied, applied: appliedNow };

	for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
		if (applied.some((r) => r.version === m.version)) continue;
		try {
			await db.transaction([
				{ text: 'SELECT pg_advisory_xact_lock($1)', params: [LOCK_ID] },
				{
					text: 'INSERT INTO toolbelt._migrations (version, name, checksum) VALUES ($1, $2, $3)',
					params: [m.version, m.name, await checksum(m.sql)]
				},
				...statementsOf(m.sql).map((text) => ({ text }))
			]);
			appliedNow.push(m.version);
		} catch (e) {
			// Another device applied it a moment ago; its transaction won and ours rolled back entirely.
			if (!isUniqueViolation(e)) throw e;
			applied = await readApplied();
		}
	}

	return { status: 'up-to-date', version: latestKnown, applied: appliedNow };
}
