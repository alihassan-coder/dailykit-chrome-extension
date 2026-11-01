// Applies black and white to the page, and follows changes from the side panel live.
import { toolValue } from '@toolbelt/core';
import { localArea } from '@toolbelt/ui/storage';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { STATE_KEY, appliesTo, filterCss, resolveState, type GrayscaleState } from '../grayscale.ts';
import { ALL_SITES } from '../sites.ts';

export default defineContentScript({
	matches: ALL_SITES,
	runAt: 'document_start',
	main(ctx) {
		const style = document.createElement('style');
		style.dataset.toolbelt = 'grayscale';

		function apply(state: GrayscaleState) {
			if (appliesTo(state, location.hostname)) {
				style.textContent = filterCss(state.strength);
				if (!style.isConnected) document.documentElement.append(style);
			} else {
				style.remove();
			}
		}

		const state = toolValue(localArea, 'grayscale', STATE_KEY, resolveState);
		void state.get().then(apply);
		const stop = state.subscribe(apply);
		ctx.onInvalidated(() => {
			stop();
			style.remove();
		});
	}
});
