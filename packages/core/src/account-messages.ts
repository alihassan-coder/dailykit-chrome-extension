// Messages between Toolbelt's screens and its background, which alone holds the database connection and
// the data key. Screens only ever see this public state, never keys.

export type AccountState =
	| { state: 'no-database' }
	| { state: 'database-error'; message: string }
	| { state: 'no-account' }
	| { state: 'locked'; username: string }
	| { state: 'unlocked'; username: string; lastSync: number | null; syncError: string | null };

export type AccountRequest =
	| { type: 'account:status' }
	| { type: 'account:create'; username: string; password: string }
	| { type: 'account:sign-in'; username: string; password: string }
	| { type: 'account:unlock'; password: string }
	| { type: 'account:recover'; username: string; recoveryKey: string; newPassword: string }
	| { type: 'account:lock' }
	| { type: 'account:forget-device' }
	| { type: 'account:rename'; username: string }
	| { type: 'account:change-password'; currentPassword: string; newPassword: string }
	| { type: 'account:set-database'; url: string }
	| { type: 'sync:now' };

export type AccountResponse =
	{ ok: true; account: AccountState; recoveryKey?: string } | { ok: false; account: AccountState; error: string };

/** Where the background publishes the public state (storage.session: gone when the browser closes). */
export const ACCOUNT_STATE_KEY = 'tb:session:account';

export const isAccountRequest = (m: unknown): m is AccountRequest =>
	typeof m === 'object' &&
	m !== null &&
	typeof (m as { type?: unknown }).type === 'string' &&
	/^(account|sync):/.test((m as { type: string }).type);

/** A Neon/Postgres connection string, checked loosely: the database itself is the real test. */
export function checkDatabaseUrl(url: string): string | null {
	try {
		const u = new URL(url.trim());
		if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return 'It should start with postgresql://';
		if (!u.password) return 'The link is missing its password part. Copy the full connection string from Neon.';
		return null;
	} catch {
		return 'That is not a database link. In Neon: your project, Connect, then copy the connection string.';
	}
}
