// Spike: page-world script. Proves a tool package can ship a MAIN-world, document_start script.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { CLAUDE } from '../sites.ts';

export default defineContentScript({
	matches: CLAUDE,
	world: 'MAIN',
	runAt: 'document_start',
	main() {
		document.documentElement.dataset.toolbeltMain = 'cairn';
	}
});
