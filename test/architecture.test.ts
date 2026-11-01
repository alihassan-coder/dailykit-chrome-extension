// Project-wide checks: every tool is complete and wired in, ids are unique, and code that runs inside web
// pages stays small. These catch the mistakes a single tool's own tests cannot see.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolDescriptor } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const toolDirs = readdirSync(join(root, 'tools'), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const descriptors = new Map<string, ToolDescriptor>();
for (const dir of toolDirs) {
	const mod = (await import(join(root, 'tools', dir, 'src', 'index.ts'))) as { default: ToolDescriptor };
	descriptors.set(dir, mod.default);
}

describe('every tool', () => {
	it.each(toolDirs)('%s has a descriptor, a side-panel screen, a logo and tests', (dir) => {
		const tool = descriptors.get(dir)!;
		expect(tool.id).toBe(dir);
		for (const file of ['src/panel.tsx', 'src/icon.tsx'])
			expect(existsSync(join(root, 'tools', dir, file)), file).toBe(true);
		const tests = existsSync(join(root, 'tools', dir, 'test')) ? readdirSync(join(root, 'tools', dir, 'test')) : [];
		expect(tests.length, `${dir} has no tests`).toBeGreaterThan(0);
		const exports = (JSON.parse(read('tools', dir, 'package.json')) as { exports: Record<string, string> }).exports;
		expect(Object.keys(exports)).toEqual(expect.arrayContaining(['.', './panel', './icon']));
	});

	it('has a unique id', () => {
		const ids = [...descriptors.values()].map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('the Toolbelt bundle', () => {
	const config = read('apps', 'toolbelt', 'wxt.config.ts');
	const shell = read('apps', 'toolbelt', 'shell', 'tools.ts');
	const bundled = toolDirs.filter((dir) => config.includes(`@toolbelt/tool-${dir}'`));

	it('includes every tool', () => {
		expect(bundled.sort()).toEqual([...toolDirs].sort());
	});

	it.each(toolDirs)('wires %s into the side panel: screen, logo and search words', (dir) => {
		for (const map of ['panels', 'icons', 'keywords']) {
			const block = shell.slice(shell.indexOf(`export const ${map}`));
			const body = block.slice(0, block.indexOf('};'));
			expect(body, `${dir} missing from ${map}`).toMatch(new RegExp(`['\\s]${dir}'?:`));
		}
	});
});

describe('code that runs inside web pages', () => {
	// Page scripts load on every site the tool runs on, so they must not pull in React or the shell UI.
	// An in-page UI entry (*-ui.content.tsx) is the one place React is allowed.
	const pageScripts = toolDirs.flatMap((dir) => {
		const entries = join(root, 'tools', dir, 'src', 'entries');
		return existsSync(entries)
			? readdirSync(entries)
					.filter((f) => /\.content\.tsx?$/.test(f) && !f.includes('-ui.'))
					.map((f) => join('tools', dir, 'src', 'entries', f))
			: [];
	});

	it.each(pageScripts)('%s imports no React and no UI package', (file) => {
		const imports = [...read(file).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
		expect(imports.filter((i) => i === 'react' || i?.startsWith('react-dom') || i === '@toolbelt/ui')).toEqual([]);
	});

	it('apps keep shared code out of WXT auto-import folders', () => {
		for (const app of readdirSync(join(root, 'apps'))) {
			for (const folder of ['components', 'composables', 'hooks', 'utils']) {
				expect(existsSync(join(root, 'apps', app, folder)), `apps/${app}/${folder}`).toBe(false);
			}
		}
	});
});

describe('the browser agent', () => {
	it('re-injects its page script by the name the build gives it', async () => {
		const { scriptFile } = await import('../packages/wxt-kit/src/manifest.ts');
		expect(read('tools', 'agent', 'src', 'page-api.ts')).toContain(`'/${scriptFile('agent', 'page')}'`);
	});
});

describe('packages', () => {
	it('core stays free of browser and React code, so it runs and tests anywhere', () => {
		for (const file of readdirSync(join(root, 'packages', 'core', 'src'))) {
			const src = read('packages', 'core', 'src', file);
			expect(src, file).not.toMatch(/from '(react|wxt\/browser|@toolbelt\/ui)/);
		}
	});
});
