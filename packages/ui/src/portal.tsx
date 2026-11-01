// Floating layers (popovers, menus, dialogs) must render inside our shadow root, not in the page's <body>,
// or they lose our styles and break outside-click handling. Every component that portals reads this.
import { createContext, useContext, type ReactNode } from 'react';

const PortalContainer = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({ container, children }: { container: HTMLElement | null; children: ReactNode }) {
	return <PortalContainer.Provider value={container}>{children}</PortalContainer.Provider>;
}

/** The element floating layers attach to. Undefined on extension pages, where document.body is correct. */
export function usePortalContainer(): HTMLElement | undefined {
	return useContext(PortalContainer) ?? undefined;
}
