// Whole account flows across "devices": each device has its own storage, all share one real Postgres.
import { ACCOUNT_STATE_KEY } from '@toolbelt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAST_TEST_KDF } from '../src/crypto.ts';
import { AUTO_LOCK_AFTER_MS, createAccountService, type KeyValue } from '../src/service.ts';
import type { Sql } from '../src/sql.ts';
import { testDatabase } from './pglite.ts';

function memoryArea(): KeyValue & { data: Record<string, unknown> } {
	const data: Record<string, unknown> = {};
	return {
		data,
		get: async (keys) => {
			if (keys == null) return { ...data };
			const list = typeof keys === 'string' ? [keys] : keys;
			return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
		},
		set: async (items) => void Object.assign(data, structuredClone(items)),
		remove: async (keys) => {
			for (const k of typeof keys === 'string' ? [keys] : keys) delete data[k];
		}
	};
}

let db: Sql & { close(): Promise<void> };
let clock = 1_000;

function device(opts: { bakedUrl?: string } = { bakedUrl: 'postgresql://u:p@db/x' }) {
	const local = memoryArea();
	const session = memoryArea();
	const service = createAccountService({
		local,
		session,
		connect: () => db,
		bakedUrl: opts.bakedUrl,
		kdf: { password: FAST_TEST_KDF, recovery: FAST_TEST_KDF },
		now: () => clock
	});
	return { local, session, service };
}

beforeEach(async () => {
	db = await testDatabase();
	clock = 1_000;
});
afterEach(() => db.close());

describe('first run', () => {
	it('asks for a database when the build has none', async () => {
		const d = device({});
		expect((await d.service.handle({ type: 'account:status' })).account).toEqual({ state: 'no-database' });
		const bad = await d.service.handle({ type: 'account:set-database', url: 'https://example.com' });
		expect(bad.ok).toBe(false);
		const good = await d.service.handle({ type: 'account:set-database', url: 'postgresql://u:p@ep-x.neon.tech/db' });
		expect(good.account).toEqual({ state: 'no-account' });
	});

	it('creates an account, shows the recovery key once, and is unlocked', async () => {
		const d = device();
		const res = await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		expect(res.ok && res.recoveryKey).toMatch(/^TB-/);
		expect(res.account).toMatchObject({ state: 'unlocked', username: 'ali' });
		expect(d.session.data[ACCOUNT_STATE_KEY]).toMatchObject({ state: 'unlocked' });
		expect(JSON.stringify(d.local.data)).not.toContain('correct horse battery');
	});

	it('uploads the settings this device already had', async () => {
		const d = device();
		d.local.data['tb:settings'] = { theme: { accent: 'plum' } };
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		const rows = await db.query<{ id: string }>('SELECT id FROM toolbelt.records');
		expect(rows.map((r) => r.id)).toEqual(['tb:settings']);
	});
});

describe('closing and reopening the browser', () => {
	it('locks when the browser closes and unlocks with the master password', async () => {
		const d = device();
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		for (const k of Object.keys(d.session.data)) delete d.session.data[k]; // browser closed: session storage gone
		expect((await d.service.handle({ type: 'account:status' })).account).toEqual({ state: 'locked', username: 'ali' });
		const wrong = await d.service.handle({ type: 'account:unlock', password: 'nope nope nope' });
		expect(wrong.ok).toBe(false);
		const right = await d.service.handle({ type: 'account:unlock', password: 'correct horse battery' });
		expect(right.account.state).toBe('unlocked');
	});

	it('locks itself after a long time unused', async () => {
		const d = device();
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		clock += AUTO_LOCK_AFTER_MS + 1;
		await d.service.autoLock();
		expect((await d.service.state()).state).toBe('locked');
	});
});

describe('several devices', () => {
	it('signs in on a second device and receives the settings and API keys', async () => {
		const laptop = device();
		laptop.local.data['tb:settings'] = { theme: { accent: 'moss' } };
		laptop.local.data['tb:ai:keys'] = { openai: 'sk-test-1234567890' };
		await laptop.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });

		const desktop = device();
		const res = await desktop.service.handle({
			type: 'account:sign-in',
			username: 'Ali',
			password: 'correct horse battery'
		});
		expect(res.account.state).toBe('unlocked');
		expect(desktop.local.data['tb:settings']).toEqual({ theme: { accent: 'moss' } });
		expect(desktop.local.data['tb:ai:keys']).toEqual({ openai: 'sk-test-1234567890' });
	});

	it('carries a change from one device to the other', async () => {
		const laptop = device();
		await laptop.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		const desktop = device();
		await desktop.service.handle({ type: 'account:sign-in', username: 'ali', password: 'correct horse battery' });

		laptop.local.data['tb:grayscale:state'] = { on: true, strength: 80, skip: [] };
		expect(await laptop.service.noteLocalChanges(['tb:grayscale:state'])).toBe(true);
		await laptop.service.sync();
		await desktop.service.sync();
		expect(desktop.local.data['tb:grayscale:state']).toEqual({ on: true, strength: 80, skip: [] });
	});

	it('keeps device-only state off the server', async () => {
		const d = device();
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		d.local.data['tb:shell:last-tool'] = 'grayscale';
		expect(await d.service.noteLocalChanges(['tb:shell:last-tool'])).toBe(false);
	});

	it('picks up a password changed on another device', async () => {
		const laptop = device();
		await laptop.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		const desktop = device();
		await desktop.service.handle({ type: 'account:sign-in', username: 'ali', password: 'correct horse battery' });
		await laptop.service.handle({
			type: 'account:change-password',
			currentPassword: 'correct horse battery',
			newPassword: 'a brand new password'
		});
		await desktop.service.handle({ type: 'account:lock' });
		const res = await desktop.service.handle({ type: 'account:unlock', password: 'a brand new password' });
		expect(res.account.state).toBe('unlocked');
	});
});

describe('changes to the account', () => {
	it('renames the user everywhere', async () => {
		const d = device();
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		const res = await d.service.handle({ type: 'account:rename', username: 'ali.hassan' });
		expect(res.account).toMatchObject({ username: 'ali.hassan' });
		const other = device();
		const signed = await other.service.handle({
			type: 'account:sign-in',
			username: 'ali.hassan',
			password: 'correct horse battery'
		});
		expect(signed.ok).toBe(true);
	});

	it('forgets the account on this device only', async () => {
		const d = device();
		await d.service.handle({ type: 'account:create', username: 'ali', password: 'correct horse battery' });
		const res = await d.service.handle({ type: 'account:forget-device' });
		expect(res.account.state).toBe('no-account');
		const again = await d.service.handle({
			type: 'account:sign-in',
			username: 'ali',
			password: 'correct horse battery'
		});
		expect(again.ok).toBe(true);
	});
});
