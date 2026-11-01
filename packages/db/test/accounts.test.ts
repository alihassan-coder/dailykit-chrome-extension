import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	AccountError,
	changePassword,
	checkPassword,
	checkUsername,
	createAccount,
	recoverAccount,
	renameUser,
	signIn
} from '../src/accounts.ts';
import { FAST_TEST_KDF, decryptRecord, encryptRecord, exportDataKey } from '../src/crypto.ts';
import { runMigrations } from '../src/migrations.ts';
import type { Sql } from '../src/sql.ts';
import { testDatabase } from './pglite.ts';

const fast = { password: FAST_TEST_KDF, recovery: FAST_TEST_KDF };
let db: Sql & { close(): Promise<void> };
beforeEach(async () => {
	db = await testDatabase();
	await runMigrations(db);
});
afterEach(() => db.close());

const reason = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return e instanceof AccountError ? e.reason : String(e);
	}
	return 'no error';
};

describe('creating an account', () => {
	it('stores no password and no readable key, only the locked data key', async () => {
		await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		const [row] = await db.query<Record<string, unknown>>('SELECT * FROM toolbelt.users');
		expect(JSON.stringify(row)).not.toContain('correct horse battery');
		expect(row).toMatchObject({ username: 'ali', username_key: 'ali' });
	});

	it('refuses a taken username, whatever its case', async () => {
		await createAccount(db, { username: 'Ali', password: 'correct horse battery' }, fast);
		expect(await reason(createAccount(db, { username: 'ali', password: 'another password' }, fast))).toBe(
			'username-taken'
		);
	});

	it('checks the username and password before touching the database', async () => {
		expect(checkUsername('a')).not.toBeNull();
		expect(checkUsername('ali.hassan')).toBeNull();
		expect(checkPassword('short')).not.toBeNull();
		expect(await reason(createAccount(db, { username: 'x y', password: 'correct horse battery' }, fast))).toBe(
			'invalid'
		);
	});
});

describe('signing in on another device', () => {
	it('opens the same data key with the right password', async () => {
		const created = await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		const signed = await signIn(db, 'ALI', 'correct horse battery');
		expect(signed.user).toEqual(created.user);
		expect(await exportDataKey(signed.dataKey)).toBe(await exportDataKey(created.dataKey));
	});

	it('says which of username or password is wrong', async () => {
		await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		expect(await reason(signIn(db, 'nobody', 'correct horse battery'))).toBe('no-such-user');
		expect(await reason(signIn(db, 'ali', 'wrong horse battery'))).toBe('wrong-password');
	});

	it('keeps two people in one database apart', async () => {
		const a = await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		const b = await createAccount(db, { username: 'sara', password: 'another long password' }, fast);
		const where = { userId: a.user.id, collection: 'kv', id: 'tb:settings' };
		const sealed = await encryptRecord(a.dataKey, where, { mine: true });
		await expect(decryptRecord(b.dataKey, where, sealed)).rejects.toThrow();
	});
});

describe('recovery and changes', () => {
	it('recovers with the recovery key and a new password, keeping the same data', async () => {
		const created = await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		const recovered = await recoverAccount(
			db,
			{ username: 'ali', recoveryKey: created.recoveryKey.toLowerCase(), newPassword: 'brand new password' },
			fast
		);
		expect(await exportDataKey(recovered.dataKey)).toBe(await exportDataKey(created.dataKey));
		expect(await reason(signIn(db, 'ali', 'correct horse battery'))).toBe('wrong-password');
		await expect(signIn(db, 'ali', 'brand new password')).resolves.toBeTruthy();
	});

	it('refuses a wrong recovery key', async () => {
		await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		const attempt = recoverAccount(
			db,
			{ username: 'ali', recoveryKey: 'TB-0000-0000-0000-0000-0000-0000-0000-0000', newPassword: 'brand new password' },
			fast
		);
		expect(await reason(attempt)).toBe('wrong-recovery-key');
	});

	it('changes the password without changing the data key', async () => {
		const created = await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		await changePassword(
			db,
			{ username: 'ali', currentPassword: 'correct horse battery', newPassword: 'brand new password' },
			fast
		);
		const signed = await signIn(db, 'ali', 'brand new password');
		expect(await exportDataKey(signed.dataKey)).toBe(await exportDataKey(created.dataKey));
	});

	it('renames the user, and the new name signs in', async () => {
		const created = await createAccount(db, { username: 'ali', password: 'correct horse battery' }, fast);
		await renameUser(db, created.user.id, 'ali.hassan');
		expect((await signIn(db, 'ali.hassan', 'correct horse battery')).user.username).toBe('ali.hassan');
	});
});
