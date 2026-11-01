import { describe, expect, it } from 'vitest';
import { defineTool, scriptId, type ToolDescriptor } from '../src/tool.ts';

const base = (): ToolDescriptor => ({
	id: 'cairn',
	name: 'Cairn',
	description: 'test',
	hostMatches: ['https://claude.ai/*'],
	permissions: [],
	contentScripts: [{ id: 'main', entry: '/x.ts', matches: ['https://claude.ai/*'], world: 'MAIN', runAt: 'document_start' }],
	features: [{ id: 'quote', title: 'Quote', description: '', defaultOn: true }]
});

describe('defineTool', () => {
	it('returns a valid descriptor unchanged', () => {
		const t = base();
		expect(defineTool(t)).toBe(t);
	});

	it.each(['Cairn', 'my_tool', '1tool', ''])('rejects tool id %j', (id) => {
		expect(() => defineTool({ ...base(), id })).toThrow(/kebab-case/);
	});

	it('rejects a content script matching a site the tool does not declare', () => {
		const t = base();
		t.contentScripts[0]!.matches = ['https://evil.example/*'];
		expect(() => defineTool(t)).toThrow(/not in hostMatches/);
	});

	it('rejects duplicate script and feature ids', () => {
		const t = base();
		t.contentScripts.push({ ...t.contentScripts[0]! });
		expect(() => defineTool(t)).toThrow(/duplicate content script/);
		const f = base();
		f.features.push({ ...f.features[0]! });
		expect(() => defineTool(f)).toThrow(/duplicate feature/);
	});
});

describe('scriptId', () => {
	it('prefixes so the shell only ever touches its own registrations', () => {
		expect(scriptId('cairn', 'main')).toBe('tb:cairn:main');
	});
});
