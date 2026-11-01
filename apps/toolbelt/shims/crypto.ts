// Node's crypto, as far as mem0 uses it: MD5 of each memory's text (its dedup hash), SHA-1 in its notices
// code, and random UUIDs. WebCrypto has no MD5, so the hashes come from @noble/hashes.
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const algorithms = { md5, sha1 };

export function createHash(algorithm: string) {
	const hash = algorithms[algorithm.toLowerCase() as keyof typeof algorithms];
	if (!hash) throw new Error(`Hash ${algorithm} is not available in the extension.`);
	const h = hash.create();
	return {
		update(data: string | Uint8Array) {
			h.update(typeof data === 'string' ? utf8ToBytes(data) : data);
			return this;
		},
		digest(encoding?: 'hex') {
			const bytes = h.digest();
			return encoding === 'hex' ? bytesToHex(bytes) : bytes;
		}
	};
}

export const randomUUID = () => globalThis.crypto.randomUUID();
export const getRandomValues = <T extends ArrayBufferView>(a: T) => globalThis.crypto.getRandomValues(a as never) as T;

export default { createHash, randomUUID, getRandomValues };
