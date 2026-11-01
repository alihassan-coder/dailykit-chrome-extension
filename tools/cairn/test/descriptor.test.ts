import { describe, expect, it } from 'vitest';
import { cairn } from '../src/index.ts';
import { CHATGPT, CLAUDE } from '../src/sites.ts';

describe('Cairn descriptor', () => {
	it('runs only on Claude and ChatGPT', () => {
		expect(cairn.hostMatches).toEqual([...CLAUDE, ...CHATGPT]);
	});

	it('watches the page from the page world before the site’s own code runs', () => {
		const main = cairn.contentScripts.find((s) => s.id === 'claude-main');
		expect(main).toMatchObject({ world: 'MAIN', runAt: 'document_start', matches: CLAUDE });
	});

	it('keeps its in-page UI in the isolated world', () => {
		expect(cairn.contentScripts.find((s) => s.id === 'claude-ui')?.world).toBe('ISOLATED');
	});
});
