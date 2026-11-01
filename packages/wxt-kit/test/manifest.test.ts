import { defineTool } from '@toolbelt/core';
import { describe, expect, it } from 'vitest';
import { applyTools, runtimeRegistry, scriptFile } from '../src/manifest.ts';
import { renameTwProperties } from '../src/css.ts';

const cairn = defineTool({
	id: 'cairn',
	name: 'Cairn',
	description: 'test',
	hostMatches: ['https://claude.ai/*'],
	permissions: ['storage', 'clipboardWrite'],
	contentScripts: [
		{
			id: 'claude-main',
			entry: '/x/claude-main.ts',
			matches: ['https://claude.ai/*'],
			world: 'MAIN',
			runAt: 'document_start'
		}
	],
	features: []
});

const generated = () => ({
	name: 'Toolbelt',
	permissions: ['storage'],
	host_permissions: ['https://claude.ai/*', 'https://neon.example/*'],
	content_scripts: [
		{ matches: ['https://claude.ai/*'], js: [scriptFile('cairn', 'claude-main')] },
		{ matches: ['https://other.example/*'], js: ['content-scripts/shell.js'] }
	]
});

describe('applyTools (bundle)', () => {
	const m = applyTools(generated(), [cairn], 'bundle');

	it('moves tool sites to optional permissions so enabling a tool is never an install-time ask', () => {
		expect(m.optional_host_permissions).toEqual(['https://claude.ai/*']);
		expect(m.host_permissions).toEqual(['https://neon.example/*']);
	});

	it('removes tool content scripts but keeps unrelated ones', () => {
		expect(m.content_scripts).toEqual([{ matches: ['https://other.example/*'], js: ['content-scripts/shell.js'] }]);
	});

	it('adds scripting and tool permissions once each', () => {
		expect(m.permissions).toEqual(['storage', 'scripting', 'clipboardWrite']);
	});

	it('drops empty keys instead of writing empty arrays', () => {
		const only = applyTools(
			{ host_permissions: ['https://claude.ai/*'], content_scripts: [{ js: [scriptFile('cairn', 'claude-main')] }] },
			[cairn],
			'bundle'
		);
		expect(only).not.toHaveProperty('host_permissions');
		expect(only).not.toHaveProperty('content_scripts');
	});

	it('does not mutate its input', () => {
		const input = generated();
		applyTools(input, [cairn], 'bundle');
		expect(input).toEqual(generated());
	});
});

describe('applyTools (standalone)', () => {
	it('keeps static content scripts and host permissions', () => {
		const m = applyTools(generated(), [cairn], 'standalone');
		expect(m.content_scripts).toHaveLength(2);
		expect(m.host_permissions).toContain('https://claude.ai/*');
		expect(m).not.toHaveProperty('optional_host_permissions');
		expect(m.permissions).toEqual(['storage', 'clipboardWrite']);
	});
});

describe('runtimeRegistry', () => {
	it('strips build-only entry paths and points at built files', () => {
		const r = runtimeRegistry([cairn], 'bundle');
		const s = r.tools[0]!.contentScripts[0]!;
		expect(s).not.toHaveProperty('entry');
		expect(s.js).toEqual(['content-scripts/cairn-claude-main.js']);
		expect(JSON.stringify(r)).not.toContain('/x/');
	});
});

describe('renameTwProperties', () => {
	it('renames @property rules, declarations and var() uses', () => {
		const css = '@property --tw-ring-color{syntax:"*"}.a{--tw-ring-color:red;box-shadow:var(--tw-ring-color)}';
		const out = renameTwProperties(css);
		expect(out).not.toContain('--tw-');
		expect(out).toContain('@property --tb-tw-ring-color');
		expect(out).toContain('var(--tb-tw-ring-color)');
	});
});
