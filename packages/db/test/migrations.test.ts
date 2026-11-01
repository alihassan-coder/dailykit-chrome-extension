import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, MigrationError, runMigrations, type Migration } from '../src/migrations.ts';
import type { Sql } from '../src/sql.ts';
import { testDatabase } from './pglite.ts';

let db: Sql & { close(): Promise<void> };
beforeEach(async () => (db = await testDatabase()));
afterEach(() => db.close());

const tables = async () =>
	(
		await db.query<{ table_name: string }>(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'toolbelt' ORDER BY table_name"
		)
	).map((r) => r.table_name);

describe('runMigrations', () => {
	it('creates the schema on an empty database and records what ran', async () => {
		const result = await runMigrations(db);
		expect(result).toEqual({ status: 'up-to-date', version: 1, applied: [1] });
		expect(await tables()).toEqual(['_migrations', 'records', 'users']);
	});

	it('does nothing the second time', async () => {
		await runMigrations(db);
		expect(await runMigrations(db)).toEqual({ status: 'up-to-date', version: 1, applied: [] });
	});

	it('applies only the new migration when the build adds one', async () => {
		await runMigrations(db);
		const next: Migration = { version: 2, name: 'notes', sql: 'CREATE TABLE toolbelt.notes (id text PRIMARY KEY)' };
		expect((await runMigrations(db, [...MIGRATIONS, next])).applied).toEqual([2]);
		expect(await tables()).toContain('notes');
	});

	it('refuses to run when a shipped migration was edited', async () => {
		await runMigrations(db);
		const edited = [{ ...MIGRATIONS[0]!, sql: `${MIGRATIONS[0]!.sql}\n-- changed` }];
		await expect(runMigrations(db, edited)).rejects.toThrow(MigrationError);
	});

	it('leaves a database migrated by a newer build alone', async () => {
		const next: Migration = { version: 2, name: 'future', sql: 'CREATE TABLE toolbelt.future (id text)' };
		await runMigrations(db, [...MIGRATIONS, next]);
		expect(await runMigrations(db)).toMatchObject({ status: 'newer-schema', version: 2 });
	});

	it('handles two devices migrating at the same moment', async () => {
		const [a, b] = await Promise.all([runMigrations(db), runMigrations(db)]);
		expect([...a.applied, ...b.applied]).toEqual([1]);
		expect(await db.query('SELECT version FROM toolbelt._migrations')).toEqual([{ version: 1 }]);
	});

	it('rolls a failing migration back completely, tracking row included', async () => {
		await runMigrations(db);
		const broken: Migration = {
			version: 2,
			name: 'broken',
			sql: 'CREATE TABLE toolbelt.half (id text)\n--> statement-breakpoint\nTHIS IS NOT SQL'
		};
		await expect(runMigrations(db, [...MIGRATIONS, broken])).rejects.toThrow();
		expect(await tables()).not.toContain('half');
		expect(await db.query('SELECT version FROM toolbelt._migrations')).toEqual([{ version: 1 }]);
	});
});
