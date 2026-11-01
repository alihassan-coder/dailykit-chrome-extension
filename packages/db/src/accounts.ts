// Toolbelt accounts: a username and a master password, stored in the user's own Neon database.
// The password is never stored or sent anywhere, not even hashed. Signing in means: derive the password
// key, and see whether it opens this user's data key.
import {
	PASSWORD_KDF,
	RECOVERY_KDF,
	deriveKey,
	newDataKey,
	newRecoveryKey,
	newSalt,
	normalizeRecoveryKey,
	unwrapDataKey,
	wrapDataKey,
	type KdfParams
} from './crypto.ts';
import { isUniqueViolation, type Sql } from './sql.ts';

export interface User {
	id: string;
	username: string;
}

export interface UserRow extends User {
	password_kdf: KdfParams;
	password_wrapped_key: string;
	recovery_kdf: KdfParams;
	recovery_wrapped_key: string;
}

export class AccountError extends Error {
	constructor(
		public readonly reason: 'username-taken' | 'no-such-user' | 'wrong-password' | 'wrong-recovery-key' | 'invalid',
		message: string
	) {
		super(message);
	}
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/i;
export const MIN_PASSWORD = 10;

export function checkUsername(username: string): string | null {
	if (!USERNAME.test(username)) return 'Use 3 to 32 letters, numbers, dots, dashes or underscores.';
	return null;
}

export function checkPassword(password: string): string | null {
	if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
	return null;
}

/** Settings can be swapped for tests; real accounts always use the strong defaults. */
export interface KdfSettings {
	password: Omit<KdfParams, 'salt'>;
	recovery: Omit<KdfParams, 'salt'>;
}
const STRONG: KdfSettings = { password: PASSWORD_KDF, recovery: RECOVERY_KDF };

export async function createAccount(
	db: Sql,
	input: { username: string; password: string },
	kdf: KdfSettings = STRONG
): Promise<{ user: User; dataKey: CryptoKey; recoveryKey: string; row: UserRow }> {
	const username = input.username.trim();
	const problem = checkUsername(username) ?? checkPassword(input.password);
	if (problem) throw new AccountError('invalid', problem);

	const id = crypto.randomUUID();
	const dataKey = await newDataKey();
	const recoveryKey = newRecoveryKey();
	const passwordKdf: KdfParams = { ...kdf.password, salt: newSalt() };
	const recoveryKdf: KdfParams = { ...kdf.recovery, salt: newSalt() };
	const row: UserRow = {
		id,
		username,
		password_kdf: passwordKdf,
		password_wrapped_key: await wrapDataKey(dataKey, await deriveKey(input.password, passwordKdf), id),
		recovery_kdf: recoveryKdf,
		recovery_wrapped_key: await wrapDataKey(
			dataKey,
			await deriveKey(normalizeRecoveryKey(recoveryKey), recoveryKdf),
			id
		)
	};

	try {
		await db.query(
			`INSERT INTO toolbelt.users (id, username, username_key, password_kdf, password_wrapped_key, recovery_kdf, recovery_wrapped_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				id,
				username,
				username.toLowerCase(),
				passwordKdf,
				row.password_wrapped_key,
				recoveryKdf,
				row.recovery_wrapped_key
			]
		);
	} catch (e) {
		if (isUniqueViolation(e)) throw new AccountError('username-taken', `The username “${username}” is already taken.`);
		throw e;
	}
	return { user: { id, username }, dataKey, recoveryKey, row };
}

export async function findUser(db: Sql, username: string): Promise<UserRow | null> {
	const rows = await db.query<UserRow>(
		`SELECT id, username, password_kdf, password_wrapped_key, recovery_kdf, recovery_wrapped_key
		 FROM toolbelt.users WHERE username_key = $1`,
		[username.trim().toLowerCase()]
	);
	return rows[0] ?? null;
}

/** Opens the data key with the master password. Works offline too, given a cached user row. */
export async function unlockWithPassword(row: UserRow, password: string): Promise<CryptoKey> {
	try {
		return await unwrapDataKey(row.password_wrapped_key, await deriveKey(password, row.password_kdf), row.id);
	} catch {
		throw new AccountError('wrong-password', 'That password is not right for this account.');
	}
}

export async function signIn(db: Sql, username: string, password: string) {
	const row = await findUser(db, username);
	if (!row) throw new AccountError('no-such-user', `There is no account called “${username.trim()}” in this database.`);
	return { user: { id: row.id, username: row.username }, dataKey: await unlockWithPassword(row, password), row };
}

async function setPassword(db: Sql, row: UserRow, dataKey: CryptoKey, password: string, kdf: KdfSettings) {
	const problem = checkPassword(password);
	if (problem) throw new AccountError('invalid', problem);
	const passwordKdf: KdfParams = { ...kdf.password, salt: newSalt() };
	const wrapped = await wrapDataKey(dataKey, await deriveKey(password, passwordKdf), row.id);
	await db.query(
		'UPDATE toolbelt.users SET password_kdf = $2, password_wrapped_key = $3, updated_at = now() WHERE id = $1',
		[row.id, passwordKdf, wrapped]
	);
	return { ...row, password_kdf: passwordKdf, password_wrapped_key: wrapped };
}

/** Forgotten password: the recovery key opens the data key, then a new password locks it again. */
export async function recoverAccount(
	db: Sql,
	input: { username: string; recoveryKey: string; newPassword: string },
	kdf: KdfSettings = STRONG
) {
	const row = await findUser(db, input.username);
	if (!row)
		throw new AccountError('no-such-user', `There is no account called “${input.username.trim()}” in this database.`);
	let dataKey: CryptoKey;
	try {
		const lock = await deriveKey(normalizeRecoveryKey(input.recoveryKey), row.recovery_kdf);
		dataKey = await unwrapDataKey(row.recovery_wrapped_key, lock, row.id);
	} catch {
		throw new AccountError('wrong-recovery-key', 'That recovery key does not open this account.');
	}
	const updated = await setPassword(db, row, dataKey, input.newPassword, kdf);
	return { user: { id: row.id, username: row.username }, dataKey, row: updated };
}

export async function changePassword(
	db: Sql,
	input: { username: string; currentPassword: string; newPassword: string },
	kdf: KdfSettings = STRONG
) {
	const { row, dataKey } = await signIn(db, input.username, input.currentPassword);
	return { dataKey, row: await setPassword(db, row, dataKey, input.newPassword, kdf) };
}

export async function renameUser(db: Sql, userId: string, newUsername: string): Promise<User> {
	const username = newUsername.trim();
	const problem = checkUsername(username);
	if (problem) throw new AccountError('invalid', problem);
	try {
		await db.query('UPDATE toolbelt.users SET username = $2, username_key = $3, updated_at = now() WHERE id = $1', [
			userId,
			username,
			username.toLowerCase()
		]);
	} catch (e) {
		if (isUniqueViolation(e)) throw new AccountError('username-taken', `The username “${username}” is already taken.`);
		throw e;
	}
	return { id: userId, username };
}
