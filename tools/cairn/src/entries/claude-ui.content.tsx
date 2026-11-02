// Placeholder until Cairn's real UI is ported: a "Save chat" chip with a popover, mounted in a shadow root.
// The e2e test uses it to prove our styles work on claude.ai without touching the page's own styles, and that
// floating layers render inside our shadow root. The user's theme (mode, accent, density, text size) is applied
// to the shadow root's container, so the chip matches the side panel and follows theme changes live.
import '@toolbelt/ui/styles.css';
import { createSettingsStore } from '@toolbelt/core';
import { PortalContainerProvider, SettingsProvider, localArea, usePortalContainer } from '@toolbelt/ui';
import { Popover } from 'radix-ui';
import { createRoot, type Root } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { CLAUDE } from '../sites.ts';

// Only the theme is read here; which tools and features are on is the background's business.
const settings = createSettingsStore(localArea, []);

function Probe() {
	const container = usePortalContainer();
	return (
		<div className="fixed right-5 bottom-5 flex items-center gap-2">
			<Popover.Root>
				<Popover.Trigger
					data-probe="chip"
					className="inline-flex h-8 cursor-pointer items-center rounded-full bg-accent px-3.5 text-base font-medium text-on-accent shadow-float hover:bg-accent/90"
				>
					Save chat
				</Popover.Trigger>
				<Popover.Portal container={container}>
					<Popover.Content
						data-probe="popover"
						side="top"
						align="end"
						sideOffset={8}
						className="tb-pop grid max-w-64 gap-0.5 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink shadow-float"
					>
						<p className="font-medium">Saving chats is coming soon</p>
						<p className="text-sm text-muted">
							Cairn will keep this chat on this device, searchable from the side panel.
						</p>
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
				// SettingsProvider writes the theme tokens onto the container, which holds both the app and the portal
				// layer, and re-applies them when settings change or the OS switches between light and dark.
				root.render(
					<SettingsProvider store={settings} themeTarget={container}>
						<PortalContainerProvider container={portal}>
							<Probe />
						</PortalContainerProvider>
					</SettingsProvider>
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
