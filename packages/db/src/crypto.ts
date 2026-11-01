// End-to-end encryption for everything Toolbelt syncs. Runs in the background only.
//
//   master password --Argon2id--> password key --AES-GCM--> unlocks the data key
//   recovery key    --Argon2id--> recovery key --AES-GCM--> unlocks the same data key
//   data key --AES-GCM--> each record, bound to (user, collection, id)
//
// Changing the password only re-locks the data key; records never need re-encrypting.
import { argon2id } from 'hash-wasm';

export interface KdfParams {
	alg: 'argon2id';
	/** base64 */
	salt: string;
	/** KiB */
	memory: number;
	iterations: number;
	parallelism: number;
}

/** Strong defaults for the master password (64 MiB, 3 passes; under a second on a laptop). */
export const PASSWORD_KDF: Omit<KdfParams, 'salt'> = { alg: 'argon2id', memory: 65_536, iterations: 3, parallelism: 1 };
/** The recovery key is already random and long, so lighter settings are enough. */
export const RECOVERY_KDF: Omit<KdfParams, 'salt'> = { alg: 'argon2id', memory: 16_384, iterations: 2, parallelism: 1 };
/** Only for tests: fast, never used for real data. */
export const FAST_TEST_KDF: Omit<KdfParams, 'salt'> = { alg: 'argon2id', memory: 1_024, iterations: 1, parallelism: 1 };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Bytes on a plain ArrayBuffer, which is what WebCrypto accepts. */
type Bytes = Uint8Array<ArrayBuffer>;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const newSalt = () => toBase64(random(16));

export async function deriveKey(secret: string, params: KdfParams): Promise<CryptoKey> {
	const raw = await argon2id({
		password: secret.normalize('NFKC'),
		salt: fromBase64(params.salt),
		memorySize: params.memory,
		iterations: params.iterations,
		parallelism: params.parallelism,
		hashLength: 32,
		outputType: 'binary'
	});
	return crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM with associated data: the ciphertext only opens for the same `context`. Output: base64(iv | ct). */
async function seal(key: CryptoKey, plaintext: Bytes, context: string): Promise<string> {
	const iv = random(12);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context) }, key, plaintext)
	);
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv);
	out.set(ct, iv.length);
	return toBase64(out);
}

async function open(key: CryptoKey, sealed: string, context: string): Promise<Bytes> {
	const bytes = fromBase64(sealed);
	const pt = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode(context) },
		key,
		bytes.slice(12)
	);
	return new Uint8Array(pt);
}

export const newDataKey = () =>
	crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export const exportDataKey = async (key: CryptoKey) =>
	toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));

export const importDataKey = (text: string) =>
	crypto.subtle.importKey('raw', fromBase64(text), 'AES-GCM', true, ['encrypt', 'decrypt']);

export async function wrapDataKey(dataKey: CryptoKey, lockKey: CryptoKey, userId: string): Promise<string> {
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
	return seal(lockKey, raw, `toolbelt:data-key:${userId}`);
}

/** Throws when the password (or recovery key) is wrong: AES-GCM refuses to open. */
export async function unwrapDataKey(wrapped: string, lockKey: CryptoKey, userId: string): Promise<CryptoKey> {
	const raw = await open(lockKey, wrapped, `toolbelt:data-key:${userId}`);
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export interface RecordAddress {
	userId: string;
	collection: string;
	id: string;
}

const recordContext = (a: RecordAddress) => `toolbelt:record:${a.userId}:${a.collection}:${a.id}`;

export const encryptRecord = (key: CryptoKey, address: RecordAddress, value: unknown) =>
	seal(key, enc.encode(JSON.stringify(value)), recordContext(address));

export async function decryptRecord<T = unknown>(key: CryptoKey, address: RecordAddress, sealed: string): Promise<T> {
	return JSON.parse(dec.decode(await open(key, sealed, recordContext(address)))) as T;
}

// Recovery key: 160 random bits in Crockford base32 (no I, L, O, U), "TB-XXXX-…" in eight groups of four.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newRecoveryKey(): string {
	const bytes = random(20);
	let bits = '';
	for (const b of bytes) bits += b.toString(2).padStart(8, '0');
	const chars = bits.match(/.{5}/g)!.map((chunk) => ALPHABET[parseInt(chunk, 2)]);
	return `TB-${chars.join('').match(/.{4}/g)!.join('-')}`;
}

/** Accepts the key however it was typed or written down. */
export function normalizeRecoveryKey(input: string): string {
	return input
		.toUpperCase()
		.replace(/^\s*TB/, '')
		.replace(/[\s-]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
}
