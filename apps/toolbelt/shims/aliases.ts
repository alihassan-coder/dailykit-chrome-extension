// Build aliases that let the mem0 SDK (written for Node) run in the background. Used by wxt.config.ts and by
// test/memory-bundle.test.ts, which builds the same way and runs the result without any Node built-ins.
//   - better-sqlite3, fs, os, path: mem0's local-file stores and notices, never used here;
//   - crypto: MD5/SHA-1 for mem0's hashes, UUIDs from WebCrypto;
//   - openai, axios: SDKs behind mem0's built-in providers, replaced by Toolbelt's fetch adapters;
//   - every optional mem0 peer becomes an empty module, so a new peer in a mem0 update cannot break the build.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shim = (name: string) => fileURLToPath(new URL(`./${name}.ts`, import.meta.url));

const mem0Package = join(
	dirname(
		createRequire(fileURLToPath(new URL('../../../packages/memory/package.json', import.meta.url))).resolve('mem0ai')
	),
	'..',
	'package.json'
);
const peers = Object.keys(
	(JSON.parse(readFileSync(mem0Package, 'utf8')) as { peerDependencies?: Record<string, string> }).peerDependencies ??
		{}
).filter((name) => name !== 'better-sqlite3');

// Package names hold only letters, digits, '@', '/', '-', '_' and '.'; the dot is the one to escape.
const exact = (name: string) => new RegExp(`^${name.replaceAll('.', '\\.')}(/.*)?$`);

export const mem0Aliases = [
	{ find: /^better-sqlite3$/, replacement: shim('better-sqlite3') },
	...(['fs', 'os', 'path', 'crypto'] as const).map((m) => ({ find: new RegExp(`^${m}$`), replacement: shim(m) })),
	{ find: /^(openai|axios)$/, replacement: shim('unused-sdk') },
	...peers.map((name) => ({ find: exact(name), replacement: shim('empty') }))
];
