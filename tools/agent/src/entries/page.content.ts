// The agent's hands and eyes inside the page: reads it, acts on it, outlines the element being approved.
// Never calls an AI model and never sees API keys; it only answers the side panel.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { perform, target } from '../actuation.ts';
import { RefRegistry, find, pageText, readPage } from '../perception.ts';
import { isPageRequest, type PageRequest } from '../protocol.ts';
import { ALL_SITES } from '../sites.ts';

export default defineContentScript({
	matches: ALL_SITES,
	runAt: 'document_idle',
	main(ctx) {
		const registry = new RefRegistry();
		let outline: HTMLDivElement | null = null;

		function highlight(ref: string | null) {
			outline?.remove();
			outline = null;
			const el = ref ? registry.get(ref) : null;
			if (!el) return;
			el.scrollIntoView({ block: 'center' });
			const r = el.getBoundingClientRect();
			outline = document.createElement('div');
			outline.dataset.toolbelt = 'agent-outline';
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
				case 'agent:act':
					return perform(registry, req.action);
				case 'agent:highlight':
					highlight(req.ref);
					return true;
			}
		}

		const onMessage = (message: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
			if (!isPageRequest(message)) return;
			sendResponse(answer(message));
		};
		browser.runtime.onMessage.addListener(onMessage);
		ctx.onInvalidated(() => {
			browser.runtime.onMessage.removeListener(onMessage);
			highlight(null);
		});
	}
});
