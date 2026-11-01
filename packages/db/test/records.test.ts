import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount } from '../src/accounts.ts';
import { FAST_TEST_KDF } from '../src/crypto.ts';
import { runMigrations } from '../src/migrations.ts';
import { planPull, pullRecords, pushRecords, syncsKey } from '../src/records.ts';
import type { Sql } from '../src/sql.ts';
import { testDatabase } from './pglite.ts';

let db: Sql & { close(): Promise<void> };
let userId: string;
let dataKey: CryptoKey;

beforeEach(async () => {
	db = await testDatabase();
	await runMigrations(db);
	const created = await createAccount(
		db,
		{ username: 'ali', password: 'correct horse battery' },
		{ password: FAST_TEST_KDF, recovery: FAST_TEST_KDF }
	);
	userId = created.user.id;
	dataKey = created.dataKey;
});
afterEach(() => db.close());

describe('pushing and pulling', () => {
	it('stores values encrypted and brings them back on another device', async () => {
		await pushRecords(db, userId, dataKey, [
			{ collection: 'kv', id: 'tb:ai:keys', value: { openai: 'sk-secret-123' } }
		]);
		const raw = await db.query('SELECT ciphertext FROM toolbelt.records');
		expect(JSON.stringify(raw)).not.toContain('sk-secret-123');
		const pulled = await pullRecords(db, userId, dataKey);
		expect(pulled).toMatchObject([{ id: 'tb:ai:keys', deleted: false, value: { openai: 'sk-secret-123' } }]);
	});

	it('updates in place and records deletes', async () => {
		await pushRecords(db, userId, dataKey, [{ collection: 'kv', id: 'tb:x', value: 1 }]);
		await pushRecords(db, userId, dataKey, [{ collection: 'kv', id: 'tb:x', value: 2 }]);
		expect((await pullRecords(db, userId, dataKey))[0]?.value).toBe(2);
		await pushRecords(db, userId, dataKey, [{ collection: 'kv', id: 'tb:x' }]);
		expect((await pullRecords(db, userId, dataKey))[0]).toMatchObject({ deleted: true, value: undefined });
	});

	it('pulls only what changed since the last pull', async () => {
		const first = await pushRecords(db, userId, dataKey, [{ collection: 'kv', id: 'tb:a', value: 'a' }]);
		await pushRecords(db, userId, dataKey, [{ collection: 'kv', id: 'tb:b', value: 'b' }]);
		expect((await pullRecords(db, userId, dataKey, first)).map((r) => r.id)).toEqual(['tb:b']);
	});
});

describe('planPull', () => {
	it('never overwrites a change this device has not pushed yet', () => {
		const pulled = [
			{ collection: 'kv', id: 'tb:settings', deleted: false, value: 'server', updatedAt: 5 },
			{ collection: 'kv', id: 'tb:ai:keys', deleted: false, value: 'server', updatedAt: 9 }
		];
		const plan = planPull(pulled, new Set(['tb:settings']));
		expect(plan.apply.map((r) => r.id)).toEqual(['tb:ai:keys']);
		expect(plan.keptLocal.map((r) => r.id)).toEqual(['tb:settings']);
		expect(plan.since).toBe(9);
	});
});

describe('syncsKey', () => {
	it('syncs settings and tool data, keeps device state local', () => {
		const synced = ['tb:settings', 'tb:ai:keys', 'tb:color-picker:history', 'tb:grayscale:state', 'tb:agent:model'];
		for (const k of [...synced, 'tb:agent:allowed-sites']) expect(syncsKey(k)).toBe(true);
		for (const k of [
			'tb:session:key',
			'tb:account',
			'tb:sync:meta',
			'tb:db-url',
			'tb:shell:last-tool',
			'tb:agent:models',
			'tb:ai:models',
			'other'
		]) {
			expect(syncsKey(k)).toBe(false);
		}
	});
});
