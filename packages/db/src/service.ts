// The background's account and sync service. It alone holds the database connection and the data key.
//
// Device storage (storage.local): the account (id, username, a copy of the user row for unlocking offline),
//   the database link if typed in, and sync bookkeeping. storage.session: the data key while unlocked and
//   the public state screens read. storage.session is emptied when the browser closes, so the next start
//   asks for the master password again.
import {
	ACCOUNT_STATE_KEY,
	checkDatabaseUrl,
	type AccountRequest,
	type AccountResponse,
	type AccountState
} from '@toolbelt/core';
import {
	AccountError,
	changePassword,
	createAccount,
	findUser,
	recoverAccount,
	renameUser,
	signIn,
	unlockWithPassword,
	type KdfSettings,
	type UserRow
} from './accounts.ts';
import { exportDataKey, importDataKey, PASSWORD_KDF, RECOVERY_KDF } from './crypto.ts';
import { runMigrations } from './migrations.ts';
import { planPull, pullRecords, pushRecords, syncsKey } from './records.ts';
import type { Sql } from './sql.ts';

/** The slice of a storage area the service needs. */
export interface KeyValue {
	get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
	set(items: Record<string, unknown>): Promise<void>;
	remove(keys: string | string[]): Promise<void>;
}

const K = {
	account: 'tb:account',
	dbUrl: 'tb:db-url',
	dirty: 'tb:sync:dirty',
	since: 'tb:sync:since',
	lastSync: 'tb:sync:last',
	key: 'tb:session:key',
	lastUsed: 'tb:session:last-used',
	syncError: 'tb:session:sync-error'
} as const;

const KV_COLLECTION = 'kv';
export const AUTO_LOCK_AFTER_MS = 8 * 60 * 60 * 1000;

interface SavedAccount {
	userId: string;
	username: string;
	row: UserRow;
}

export interface ServiceOptions {
	local: KeyValue;
	session: KeyValue;
	connect: (url: string) => Sql;
	/** Link baked into a personal build from its .env, if any. */
	bakedUrl?: string;
	kdf?: KdfSettings;
	now?: () => number;
}

export function createAccountService(opts: ServiceOptions) {
	const { local, session, connect } = opts;
	const kdf = opts.kdf ?? { password: PASSWORD_KDF, recovery: RECOVERY_KDF };
	const now = opts.now ?? Date.now;
	// Keys written by a pull; their change events must not be pushed straight back.
	const applying = new Set<string>();
	let db: { url: string; sql: Sql; ready: Promise<unknown> } | null = null;

	async function databaseUrl(): Promise<string | null> {
		const saved = (await local.get(K.dbUrl))[K.dbUrl];
		return typeof saved === 'string' && saved ? saved : opts.bakedUrl || null;
	}

	/** The database, migrated once per background lifetime. */
	async function database(): Promise<Sql> {
		const url = await databaseUrl();
		if (!url) throw new AccountError('invalid', 'No database is connected.');
		if (!db || db.url !== url) {
			const sql = connect(url);
			db = { url, sql, ready: runMigrations(sql) };
		}
		try {
			await db.ready;
		} catch (e) {
			db = null;
			throw e;
		}
		return db.sql;
	}

	const savedAccount = async () => ((await local.get(K.account))[K.account] as SavedAccount | undefined) ?? null;

	async function dataKey(): Promise<CryptoKey | null> {
		const raw = (await session.get(K.key))[K.key];
		return typeof raw === 'string' ? importDataKey(raw) : null;
	}

	async function state(): Promise<AccountState> {
		if (!(await databaseUrl())) return { state: 'no-database' };
		const account = await savedAccount();
		if (!account) {
			try {
				await database();
			} catch (e) {
				return { state: 'database-error', message: describe(e) };
			}
			return { state: 'no-account' };
		}
		if (!(await dataKey())) return { state: 'locked', username: account.username };
		const s = await session.get([K.syncError]);
		const l = await local.get(K.lastSync);
		return {
			state: 'unlocked',
			username: account.username,
			lastSync: typeof l[K.lastSync] === 'number' ? (l[K.lastSync] as number) : null,
			syncError: typeof s[K.syncError] === 'string' ? (s[K.syncError] as string) : null
		};
	}

	async function publish(): Promise<AccountState> {
		const s = await state();
		await session.set({ [ACCOUNT_STATE_KEY]: s });
		return s;
	}

	async function startSession(account: SavedAccount, key: CryptoKey) {
		await local.set({ [K.account]: account });
		await session.set({ [K.key]: await exportDataKey(key), [K.lastUsed]: now() });
	}

	async function lock() {
		await session.remove([K.key, K.lastUsed, K.syncError]);
	}

	// ---- sync ----

	async function dirtyKeys(): Promise<Set<string>> {
		const raw = (await local.get(K.dirty))[K.dirty];
		return new Set(Array.isArray(raw) ? (raw as string[]) : []);
	}

	async function push(sql: Sql, account: SavedAccount, key: CryptoKey) {
		const dirty = await dirtyKeys();
		if (!dirty.size) return;
		const values = await local.get([...dirty]);
		await pushRecords(
			sql,
			account.userId,
			key,
			[...dirty].map((id) => ({ collection: KV_COLLECTION, id, value: values[id] }))
		);
		// Keys changed again while pushing stay dirty for the next round.
		const after = await dirtyKeys();
		for (const id of dirty) after.delete(id);
		await local.set({ [K.dirty]: [...after] });
	}

	async function pull(sql: Sql, account: SavedAccount, key: CryptoKey, everything = false) {
		const sinceRaw = (await local.get(K.since))[K.since];
		const since = everything || typeof sinceRaw !== 'number' ? 0 : sinceRaw;
		const pulled = await pullRecords(sql, account.userId, key, since, KV_COLLECTION);
		const plan = planPull(pulled, await dirtyKeys());
		for (const r of plan.apply) applying.add(r.id);
		try {
			const sets = Object.fromEntries(plan.apply.filter((r) => !r.deleted).map((r) => [r.id, r.value]));
			const removes = plan.apply.filter((r) => r.deleted).map((r) => r.id);
			if (Object.keys(sets).length) await local.set(sets);
			if (removes.length) await local.remove(removes);
		} finally {
			for (const r of plan.apply) applying.delete(r.id);
		}
		if (plan.since > since) await local.set({ [K.since]: plan.since });
		return pulled;
	}

	/** First sync on a device: take what the account already has, upload what only this device has. */
	async function firstSync(account: SavedAccount, key: CryptoKey) {
		const sql = await database();
		const pulled = await pull(sql, account, key, true);
		const onServer = new Set(pulled.map((r) => r.id));
		const localOnly = Object.keys(await local.get(null)).filter((k) => syncsKey(k) && !onServer.has(k));
		const dirty = await dirtyKeys();
		for (const k of localOnly) dirty.add(k);
		await local.set({ [K.dirty]: [...dirty] });
		await push(sql, account, key);
		await local.set({ [K.lastSync]: now() });
	}

	async function sync(): Promise<AccountState> {
		const account = await savedAccount();
		const key = await dataKey();
		if (!account || !key) return publish();
		try {
			const sql = await database();
			await push(sql, account, key);
			await pull(sql, account, key);
			await local.set({ [K.lastSync]: now() });
			await session.remove(K.syncError);
		} catch (e) {
			await session.set({ [K.syncError]: `Sync paused: ${describe(e)} Your changes are kept on this device.` });
		}
		return publish();
	}

	/** Call from storage.onChanged (local area). Marks changed keys for the next push. */
	async function noteLocalChanges(keys: string[]) {
		const changed = keys.filter((k) => syncsKey(k) && !applying.has(k));
		if (!changed.length || !(await dataKey())) return false;
		const dirty = await dirtyKeys();
		for (const k of changed) dirty.add(k);
		await local.set({ [K.dirty]: [...dirty] });
		return true;
	}

	/** Call from a periodic alarm. Locks after a long time without use. */
	async function autoLock() {
		const used = (await session.get(K.lastUsed))[K.lastUsed];
		if (typeof used === 'number' && now() - used > AUTO_LOCK_AFTER_MS) {
			await lock();
			await publish();
		}
	}

	// ---- requests from screens ----

	async function handle(req: AccountRequest): Promise<AccountResponse> {
		try {
			if (await dataKey()) await session.set({ [K.lastUsed]: now() });
			let recoveryKey: string | undefined;

			switch (req.type) {
				case 'account:status':
					break;

				case 'account:set-database': {
					const problem = checkDatabaseUrl(req.url);
					if (problem) throw new AccountError('invalid', problem);
					const url = req.url.trim();
					await runMigrations(connect(url)); // proves the link works before saving it
					await local.set({ [K.dbUrl]: url });
					db = null;
					break;
				}

				case 'account:create': {
					const created = await createAccount(await database(), req, kdf);
					const account = { userId: created.user.id, username: created.user.username, row: created.row };
					await startSession(account, created.dataKey);
					await firstSync(account, created.dataKey);
					recoveryKey = created.recoveryKey;
					break;
				}

				case 'account:sign-in': {
					const signed = await signIn(await database(), req.username, req.password);
					const account = { userId: signed.user.id, username: signed.user.username, row: signed.row };
					await local.remove([K.dirty, K.since]);
					await startSession(account, signed.dataKey);
					await firstSync(account, signed.dataKey);
					break;
				}

				case 'account:unlock': {
					const account = await savedAccount();
					if (!account) throw new AccountError('no-such-user', 'Sign in first.');
					let key: CryptoKey;
					try {
						key = await unlockWithPassword(account.row, req.password);
					} catch (e) {
						// The password may have been changed on another device: try the latest copy of the account.
						const fresh = await findUser(await database(), account.username).catch(() => null);
						if (!fresh) throw e;
						key = await unlockWithPassword(fresh, req.password);
						account.row = fresh;
					}
					await startSession(account, key);
					await sync();
					break;
				}

				case 'account:recover': {
					const recovered = await recoverAccount(await database(), req, kdf);
					const account = { userId: recovered.user.id, username: recovered.user.username, row: recovered.row };
					await startSession(account, recovered.dataKey);
					await firstSync(account, recovered.dataKey);
					break;
				}

				case 'account:lock':
					await lock();
					break;

				case 'account:forget-device':
					await lock();
					await local.remove([K.account, K.dirty, K.since, K.lastSync]);
					break;

				case 'account:rename': {
					const account = await savedAccount();
					if (!account) throw new AccountError('no-such-user', 'Sign in first.');
					const user = await renameUser(await database(), account.userId, req.username);
					await local.set({
						[K.account]: { ...account, username: user.username, row: { ...account.row, username: user.username } }
					});
					break;
				}

				case 'account:change-password': {
					const account = await savedAccount();
					if (!account) throw new AccountError('no-such-user', 'Sign in first.');
					const changed = await changePassword(
						await database(),
						{ username: account.username, currentPassword: req.currentPassword, newPassword: req.newPassword },
						kdf
					);
					await local.set({ [K.account]: { ...account, row: changed.row } });
					break;
				}

				case 'sync:now':
					return { ok: true, account: await sync() };
			}
			return { ok: true, account: await publish(), ...(recoveryKey ? { recoveryKey } : {}) };
		} catch (e) {
			return { ok: false, account: await publish(), error: describe(e) };
		}
	}

	/** Who is signed in and their data key, while unlocked. For other background services (memory). */
	async function unlocked(): Promise<{ userId: string; key: CryptoKey } | null> {
		const account = await savedAccount();
		const key = account && (await dataKey());
		return account && key ? { userId: account.userId, key } : null;
	}

	return { handle, sync, noteLocalChanges, autoLock, publish, state, unlocked, database };
}

function describe(e: unknown): string {
	if (e instanceof AccountError) return e.message;
	const message = e instanceof Error ? e.message : String(e);
	if (/fetch|network|Failed to fetch|ENOTFOUND|ECONN/i.test(message))
		return 'The database could not be reached. Check your connection.';
	if (/password authentication failed/i.test(message)) return 'The database refused the link: its password is wrong.';
	return message;
}
