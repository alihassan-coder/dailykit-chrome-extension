// Phase 1 spikes 2 and 3, against the built Cairn standalone extension:
//   2. Tailwind v4 UI in a shadow root works on a page that itself uses Tailwind v3, without breaking it.
//   3. A Radix popover portals into our shadow root and closes on an outside click.
import type { Server } from 'node:https';
import { resolve } from 'node:path';
import type { Browser, ElementHandle, Page } from 'puppeteer-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchWithExtension, serveHtml } from './harness.ts';

const EXTENSION = resolve(import.meta.dirname, '../apps/cairn/.output/chrome-mv3');

// A fake claude.ai: a large root font size (rem trap) and Tailwind v3 gradient utilities, which break when an
// extension leaks typed `@property --tw-*` rules into the page (wxt-dev/wxt#1955).
const PAGE = `<!doctype html><html><head><style>
html { font-size: 10px; }
body { margin: 0; color: rgb(10, 20, 30); }
*, ::before, ::after { --tw-gradient-from-position: ; --tw-gradient-to-position: ; }
.bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
.from-red-500 { --tw-gradient-from: #ef4444 var(--tw-gradient-from-position); --tw-gradient-to: rgb(239 68 68 / 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
.to-blue-500 { --tw-gradient-to: #3b82f6 var(--tw-gradient-to-position); }
</style></head><body>
<div id="host-gradient" class="bg-gradient-to-r from-red-500 to-blue-500" style="height:40px">claude</div>
<p id="outside" style="height:200px">page text</p>
</body></html>`;

let server: Server;
let browser: Browser;
let page: Page;

async function chip(): Promise<ElementHandle<Element>> {
	const handle = await page.waitForFunction(
		() => document.querySelector('toolbelt-cairn')?.shadowRoot?.querySelector('[data-probe="chip"]'),
		{ timeout: 10_000 }
	);
	return handle as ElementHandle<Element>;
}

beforeAll(async () => {
	const s = await serveHtml('claude.ai', PAGE);
	server = s.server;
	browser = await launchWithExtension(EXTENSION, { host: 'claude.ai', port: s.port });
	page = await browser.newPage();
	await page.goto('https://claude.ai/new', { waitUntil: 'load' });
	await chip();
}, 60_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
});

describe('page-world script', () => {
	it('runs in the page world at document_start', async () => {
		expect(await page.evaluate(() => document.documentElement.dataset.toolbeltMain)).toBe('cairn');
	});
});

describe('shadow-root UI (spike 2)', () => {
	it('applies Toolbelt tokens inside the shadow root', async () => {
		const style = await (
			await chip()
		).evaluate((el) => {
			const s = getComputedStyle(el);
			return { bg: s.backgroundColor, fontSize: s.fontSize, shadow: s.boxShadow };
		});
		expect(style.bg).toBe('rgb(68, 103, 245)'); // the default Toolbelt blue, #4467f5, applied from settings
		expect(style.fontSize).toBe('13px'); // px tokens: unaffected by the page's 10px root font size
		expect(style.shadow).not.toBe('none'); // ring + shadow rely on hoisted @property rules
	});

	it('does not break the page’s own Tailwind v3 gradient', async () => {
		const bg = await page.$eval('#host-gradient', (el) => getComputedStyle(el).backgroundImage);
		expect(bg).toContain('rgb(239, 68, 68)');
		expect(bg).toContain('rgb(59, 130, 246)');
	});

	it('leaks no styles into the page', async () => {
		expect(await page.$eval('body', (el) => getComputedStyle(el).color)).toBe('rgb(10, 20, 30)');
		const leaked = await page.evaluate(() =>
			[...document.styleSheets].some((sheet) => {
				try {
					return [...sheet.cssRules].some((r) => r.cssText.includes('--tw-') && r.cssText.startsWith('@property'));
				} catch {
					return false;
				}
			})
		);
		expect(leaked).toBe(false);
	});
});

describe('Radix popover in the shadow root (spike 3)', () => {
	const popover = () =>
		page.evaluate(() => {
			const root = document.querySelector('toolbelt-cairn')?.shadowRoot;
			const el = root?.querySelector('[data-probe="popover"]');
			return {
				inShadow: !!el,
				inBody: !!document.body.querySelector('[data-probe="popover"]'),
				bg: el ? getComputedStyle(el).backgroundColor : null
			};
		});

	it('opens inside our shadow root, styled', async () => {
		await (await chip()).click();
		await page.waitForFunction(() =>
			document.querySelector('toolbelt-cairn')?.shadowRoot?.querySelector('[data-probe="popover"]')
		);
		expect(await popover()).toEqual({ inShadow: true, inBody: false, bg: 'rgb(255, 255, 255)' });
	});

	it('closes on a click outside, on the page', async () => {
		await page.click('#outside');
		await page.waitForFunction(
			() => !document.querySelector('toolbelt-cairn')?.shadowRoot?.querySelector('[data-probe="popover"]'),
			{
				timeout: 3_000
			}
		);
		expect((await popover()).inShadow).toBe(false);
	});
});
