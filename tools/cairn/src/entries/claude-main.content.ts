// Placeholder until Cairn's page bridge is ported: marks the page so tests can see the page-world script ran.
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
