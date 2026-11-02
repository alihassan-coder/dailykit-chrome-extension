// Applies black and white to the page, and follows changes from the side panel live. With a schedule, it also
// switches itself at the start and end of the window.
import { toolValue } from '@toolbelt/core';
import { localArea } from '@toolbelt/ui/storage';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { STATE_KEY, appliesTo, filterCss, nextChange, resolveState, type GrayscaleState } from '../grayscale.ts';
import { ALL_SITES } from '../sites.ts';

export default defineContentScript({
	matches: ALL_SITES,
	runAt: 'document_start',
	main(ctx) {
		const style = document.createElement('style');
		style.dataset.toolbelt = 'grayscale';
		let latest: GrayscaleState | null = null;
		let timer: number | undefined;

		function apply(state: GrayscaleState) {
			latest = state;
			const now = new Date();
			if (appliesTo(state, location.hostname, now)) {
				style.textContent = filterCss(state.strength);
				if (!style.isConnected) document.documentElement.append(style);
			} else {
				style.remove();
			}
			clearTimeout(timer);
			const wait = nextChange(state.schedule, now);
			// A second late, so the clock is past the boundary when it runs.
			if (wait !== null) timer = ctx.setTimeout(() => latest && apply(latest), wait + 1000);
		}

		const state = toolValue(localArea, 'grayscale', STATE_KEY, resolveState);
		void state.get().then(apply);
		const stop = state.subscribe(apply);
		// Timers stall while a laptop sleeps: check again when the tab is seen.
		ctx.addEventListener(document, 'visibilitychange', () => {
			if (!document.hidden && latest) apply(latest);
		});
		ctx.onInvalidated(() => {
			stop();
			clearTimeout(timer);
			style.remove();
		});
	}
});
