// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { collectPageColors } from '../src/page-colors.ts';

describe('collectPageColors', () => {
	it('weighs visible backgrounds by area and text by length, skipping hidden and transparent things', () => {
		document.body.innerHTML = `
			<div id="big" style="background-color: rgb(10, 20, 30)">Hello there</div>
			<p id="text" style="color: rgb(200, 0, 0)">Some words on the page</p>
			<div id="hidden" style="display: none; background-color: rgb(0, 255, 0)"></div>
			<div id="clear" style="background-color: rgba(0, 0, 255, 0.1)"></div>`;
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			const size = this.id === 'big' ? 500 : 50;
			return { width: size, height: size, top: 0, bottom: size, left: 0, right: size } as DOMRect;
		});
		const colors = new Map(collectPageColors());
		expect(colors.get('#0a141e')).toBeGreaterThan(100);
		expect(colors.get('#c80000')).toBeGreaterThan(1);
		expect(colors.has('#00ff00')).toBe(false);
		expect(colors.has('#0000ff')).toBe(false);
		vi.restoreAllMocks();
	});
});
