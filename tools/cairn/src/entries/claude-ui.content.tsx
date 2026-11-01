// Spike: React + Tailwind inside a shadow root on claude.ai. Checks that styles apply (incl. shadow/ring, which
// depend on @property), that the page's own styles stay untouched, and that a Radix popover portals into our
// shadow root and closes on an outside click.
import '@toolbelt/ui/styles.css';
import { PortalContainerProvider, usePortalContainer } from '@toolbelt/ui';
import { Popover } from 'radix-ui';
import { createRoot, type Root } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { CLAUDE } from '../sites.ts';

function Probe() {
	const container = usePortalContainer();
	return (
		<div className="fixed right-5 bottom-5 flex items-center gap-2">
			<Popover.Root>
				<Popover.Trigger
					data-probe="chip"
					className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent shadow-float ring-2 ring-accent/30"
				>
					Save chat
				</Popover.Trigger>
				<Popover.Portal container={container}>
					<Popover.Content
						data-probe="popover"
						side="top"
						sideOffset={8}
						className="rounded-md border border-line bg-surface p-3 text-sm text-ink shadow-float"
					>
						Saved to this device
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</div>
	);
}

export default defineContentScript({
	matches: CLAUDE,
	runAt: 'document_idle',
	cssInjectionMode: 'ui',
	async main(ctx) {
		const ui = await createShadowRootUi<Root>(ctx, {
			name: 'toolbelt-cairn',
			position: 'inline',
			anchor: 'body',
			append: 'last',
			isolateEvents: ['keydown', 'keyup', 'keypress'],
			onMount(container) {
				// App and portal layer are siblings: React owns everything inside the element it renders into.
				container.setAttribute('data-tb-root', '');
				const app = document.createElement('div');
				const portal = document.createElement('div');
				portal.setAttribute('data-tb-portal', '');
				container.append(app, portal);
				const root = createRoot(app);
				root.render(
					<PortalContainerProvider container={portal}>
						<Probe />
					</PortalContainerProvider>
				);
				return root;
			},
			onRemove(root) {
				root?.unmount();
			}
		});
		ui.mount();
	}
});
