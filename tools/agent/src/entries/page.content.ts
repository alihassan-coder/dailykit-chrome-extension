// The agent's hands and eyes inside the page: reads it, acts on it, outlines the element being approved.
// Never calls an AI model and never sees API keys; it only answers the side panel.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { act, focusedTarget, target, waitFor } from '../actuation.ts';
import { RefRegistry, find, pageText, readPage } from '../perception.ts';
import { isPageRequest, type PageRequest } from '../protocol.ts';
import { ALL_SITES } from '../sites.ts';

// The side panel adds this script to tabs opened before the agent was switched on. If it is already running
// (registered and injected, or injected twice), the second copy must not add a second listener: every action
// would then run twice.
const RUNNING = '__toolbeltAgentPage';
type Flagged = typeof globalThis & { [RUNNING]?: boolean };

export default defineContentScript({
	matches: ALL_SITES,
	runAt: 'document_idle',
	main(ctx) {
		const scope = globalThis as Flagged;
		if (scope[RUNNING]) return;
		scope[RUNNING] = true;
		const registry = new RefRegistry();
		let outline: HTMLDivElement | null = null;

		function highlight(ref: string | null): boolean {
			outline?.remove();
			outline = null;
			const el = ref ? registry.get(ref) : null;
			if (!el) return ref === null;
			el.scrollIntoView({ block: 'center' });
			const r = el.getBoundingClientRect();
			outline = document.createElement('div');
			outline.dataset.toolbelt = 'agent-outline';
			// Drawn on the website, outside Toolbelt's themed shadow roots, so theme tokens are not available here.
			Object.assign(outline.style, {
				position: 'fixed',
				left: `${r.left - 4}px`,
				top: `${r.top - 4}px`,
				width: `${r.width + 8}px`,
				height: `${r.height + 8}px`,
				border: '2px solid #2e55e6',
				borderRadius: '6px',
				boxShadow: '0 0 0 4px rgb(46 85 230 / 0.2)',
				pointerEvents: 'none',
				zIndex: '2147483647'
			});
			document.documentElement.append(outline);
			return true;
		}

		function answer(req: PageRequest): unknown {
			switch (req.type) {
				case 'agent:ping':
					return true;
				case 'agent:read':
					return readPage(document, registry, { all: req.all, ref: req.ref });
				case 'agent:find':
					return find(document, registry, req.query);
				case 'agent:text':
					return pageText(document);
				case 'agent:target':
					return target(registry, req.ref);
				case 'agent:focused':
					return focusedTarget(registry, document);
				case 'agent:act':
					return act(registry, req.action, document);
				case 'agent:wait':
					return waitFor(document, req);
				case 'agent:highlight':
					return highlight(req.ref);
			}
		}

		const onMessage = (message: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
			if (!isPageRequest(message)) return;
			let reply: unknown;
			try {
				reply = answer(message);
			} catch (error) {
				// A page that throws inside our handlers (a hostile getter, a detached frame) gets a plain error reply.
				sendResponse({ error: error instanceof Error ? error.name : 'Error' });
				return;
			}
			if (reply instanceof Promise) {
				reply.then(sendResponse, (error: unknown) =>
					sendResponse({ error: error instanceof Error ? error.name : 'Error' })
				);
				return true; // keep the channel open for the async reply
			}
			sendResponse(reply);
		};
		browser.runtime.onMessage.addListener(onMessage);
		ctx.onInvalidated(() => {
			browser.runtime.onMessage.removeListener(onMessage);
			highlight(null);
			scope[RUNNING] = false;
		});
	}
});
