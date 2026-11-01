import { describe, expect, it } from 'vitest';
import { checkDatabaseUrl, isAccountRequest } from '../src/account-messages.ts';

describe('account messages', () => {
	it('recognises account and sync requests only', () => {
		expect(isAccountRequest({ type: 'account:unlock', password: 'x' })).toBe(true);
		expect(isAccountRequest({ type: 'sync:now' })).toBe(true);
		expect(isAccountRequest({ type: 'other' })).toBe(false);
		expect(isAccountRequest(null)).toBe(false);
	});

	it('checks a database link before trying it', () => {
		expect(checkDatabaseUrl('postgresql://user:pw@ep-x.neon.tech/db?sslmode=require')).toBeNull();
		expect(checkDatabaseUrl('postgres://user:pw@host/db')).toBeNull();
		expect(checkDatabaseUrl('https://neon.tech')).toMatch(/postgresql/);
		expect(checkDatabaseUrl('postgresql://user@host/db')).toMatch(/password/);
		expect(checkDatabaseUrl('hello')).toMatch(/not a database link/);
	});
});
