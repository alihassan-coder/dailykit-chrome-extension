// The agent's memory runs the mem0 SDK, which is written for Node, inside the extension's background. This
// builds it the same way the background is built (IIFE, with apps/toolbelt/shims) and runs the result in a
// sandbox with only what a service worker has: no process, require, fs or Node crypto. It must work there,
// and send nothing to mem0's telemetry (PostHog) or notices (GitHub).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { mem0Aliases } from '../apps/toolbelt/shims/aliases.ts';

const root = join(import.meta.dirname, '..');

describe('memory in the background bundle', () => {
	it('runs mem0 without Node, and its only traffic is the AI provider', async () => {
		const outDir = mkdtempSync(join(tmpdir(), 'tb-memory-'));
		await build({
			configFile: false,
			logLevel: 'silent',
			root,
			resolve: { alias: mem0Aliases },
			build: {
				outDir,
				minify: false,
				lib: {
					entry: join(root, 'test', 'fixtures', 'memory-bundle-entry.ts'),
					formats: ['iife'],
					name: 'memoryBundle',
					fileName: () => 'background.js'
				}
			}
		});
		const code = readFileSync(join(outDir, 'background.js'), 'utf8');

		const globalFetches: string[] = [];
		const sandbox: Record<string, unknown> = {
			console: { ...console, log() {}, debug() {}, warn() {} },
			crypto: globalThis.crypto,
			fetch: async (url: unknown) => {
				globalFetches.push(String(url));
				throw new Error('blocked');
			},
			...Object.fromEntries(
				[
					'TextEncoder',
					'TextDecoder',
					'atob',
					'btoa',
					'structuredClone',
					'AbortSignal',
					'Response',
					'URL',
					'setTimeout',
					'clearTimeout',
					'queueMicrotask'
				].map((name) => [name, (globalThis as Record<string, unknown>)[name]])
			)
		};
		sandbox.globalThis = sandbox;
		vm.createContext(sandbox);
		vm.runInContext(code, sandbox);

		const result = (await (sandbox.smoke as () => Promise<{ found: string[]; uploads: number; urls: string[] }>)())!;
		expect(result.found).toEqual(['I am vegetarian and live in Lahore']);
		expect(result.uploads).toBeGreaterThan(0);
		expect(new Set(result.urls.map((u) => new URL(u).host))).toEqual(new Set(['api.openai.com']));
		// mem0's telemetry and notices use the global fetch; nothing may reach it.
		expect(globalFetches).toEqual([]);
		expect((sandbox.process as { env: Record<string, string> }).env.MEM0_TELEMETRY).toBe('false');
		expect('require' in sandbox).toBe(false);
	}, 120_000);
});
