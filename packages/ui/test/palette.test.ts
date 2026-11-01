import { describe, expect, it } from 'vitest';
import { rankCommands, type Command } from '../src/palette.ts';

const cmd = (id: string, title: string, keywords: string[] = []): Command => ({ id, title, keywords, run: () => {} });
const commands = [
	cmd('tool:color', 'Colour picker', ['eyedropper', 'hex']),
	cmd('tool:bw', 'Black and white', ['grayscale', 'greyscale']),
	cmd('settings:appearance', 'Appearance settings', ['theme', 'dark mode']),
	cmd('tool:cairn', 'Cairn', ['chat history'])
];
const ids = (q: string) => rankCommands(q, commands).map((c) => c.id);

describe('rankCommands', () => {
	it('shows everything, in order, for an empty search', () => {
		expect(ids('')).toEqual(commands.map((c) => c.id));
	});

	it('ranks a title that starts with the search first', () => {
		expect(ids('c')[0]).toBe('tool:color');
		expect(ids('ca')).toEqual(['tool:cairn']);
	});

	it('matches the start of any word, then keywords', () => {
		expect(ids('white')).toEqual(['tool:bw']);
		expect(ids('gray')).toEqual(['tool:bw']);
		expect(ids('theme')).toEqual(['settings:appearance']);
	});

	it('forgives skipped letters (cpk finds Colour picker) and ignores case', () => {
		expect(ids('CPK')).toContain('tool:color');
	});

	it('returns nothing when nothing fits', () => {
		expect(ids('zzz')).toEqual([]);
	});
});
