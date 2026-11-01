import { describe, expect, it } from 'vitest';
import {
	FAST_TEST_KDF,
	decryptRecord,
	deriveKey,
	encryptRecord,
	exportDataKey,
	importDataKey,
	newDataKey,
	newRecoveryKey,
	newSalt,
	normalizeRecoveryKey,
	unwrapDataKey,
	wrapDataKey
} from '../src/crypto.ts';

const kdf = { ...FAST_TEST_KDF, salt: newSalt() };

describe('data key', () => {
	it('is locked with the password and opens only with the same password', async () => {
		const dataKey = await newDataKey();
		const wrapped = await wrapDataKey(dataKey, await deriveKey('correct horse', kdf), 'user-1');
		const opened = await unwrapDataKey(wrapped, await deriveKey('correct horse', kdf), 'user-1');
		expect(await exportDataKey(opened)).toBe(await exportDataKey(dataKey));
		await expect(unwrapDataKey(wrapped, await deriveKey('wrong horse', kdf), 'user-1')).rejects.toThrow();
	});

	it('cannot be moved to another user', async () => {
		const passwordKey = await deriveKey('pw', kdf);
		const wrapped = await wrapDataKey(await newDataKey(), passwordKey, 'user-1');
		await expect(unwrapDataKey(wrapped, passwordKey, 'user-2')).rejects.toThrow();
	});

	it('survives being kept for the session as text', async () => {
		const dataKey = await newDataKey();
		const again = await importDataKey(await exportDataKey(dataKey));
		const sealed = await encryptRecord(again, { userId: 'u', collection: 'kv', id: 'x' }, { ok: true });
		expect(await decryptRecord(dataKey, { userId: 'u', collection: 'kv', id: 'x' }, sealed)).toEqual({ ok: true });
	});
});

describe('records', () => {
	const where = { userId: 'user-1', collection: 'kv', id: 'tb:settings' };

	it('round-trips any JSON value, and each encryption looks different', async () => {
		const key = await newDataKey();
		const value = { theme: { accent: '#ff5500' }, list: [1, 2, 3] };
		const a = await encryptRecord(key, where, value);
		const b = await encryptRecord(key, where, value);
		expect(a).not.toBe(b);
		expect(JSON.stringify(a)).not.toContain('ff5500');
		expect(await decryptRecord(key, where, a)).toEqual(value);
	});

	it('refuses a record copied to another place or user', async () => {
		const key = await newDataKey();
		const sealed = await encryptRecord(key, where, 'secret');
		await expect(decryptRecord(key, { ...where, id: 'tb:ai:keys' }, sealed)).rejects.toThrow();
		await expect(decryptRecord(key, { ...where, userId: 'user-2' }, sealed)).rejects.toThrow();
	});
});

describe('recovery key', () => {
	it('is easy to write down: TB- and eight groups of four', () => {
		expect(newRecoveryKey()).toMatch(/^TB(-[0-9A-HJKMNP-TV-Z]{4}){8}$/);
		expect(newRecoveryKey()).not.toBe(newRecoveryKey());
	});

	it('forgives spaces, lower case and letters that look like digits', () => {
		const key = 'TB-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789';
		expect(normalizeRecoveryKey(' tb abcd efgh jkmn pqrs tvwx yzo1 2345 6789 ')).toBe(normalizeRecoveryKey(key));
		expect(normalizeRecoveryKey('TB-ABCD-EFGH-JKMN-PQRS-TVWX-YZ0I-2345-6789')).toBe(normalizeRecoveryKey(key));
	});
});
