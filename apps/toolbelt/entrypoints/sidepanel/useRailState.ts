// How the toolbar on the right behaves. Wide panels: opening it pushes the content and is saved in settings.
// Narrow panels: it opens over the content (a modal sheet with a scrim), closes when you pick something, and
// is never saved.
import { setTheme } from '@toolbelt/core';
import { showError, useSettings } from '@toolbelt/ui';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** From this width (px) the panel has room for a pinned, labelled toolbar and a search field. */
export const WIDE_PANEL = 520;

export function useRailState(root: RefObject<HTMLElement | null>) {
	const { settings, update } = useSettings();
	const [wide, setWide] = useState(true);
	const [overlay, setOverlayState] = useState(false);
	// What had focus before the sheet opened, so closing it puts focus back.
	const returnTo = useRef<HTMLElement | null>(null);

	function setOverlay(open: boolean) {
		if (open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setOverlayState(open);
	}

	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		// The observer reports the first size right away, so there is no separate first measure.
		const ro = new ResizeObserver(([entry]) => {
			const isWide = (entry?.contentRect.width ?? el.clientWidth) >= WIDE_PANEL;
			setWide(isWide);
			if (isWide) setOverlayState(false);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [root]);

	const pinned = settings.theme.rail === 'labels';

	function toggle() {
		if (wide) {
			update((s) => setTheme(s, { rail: s.theme.rail === 'labels' ? 'icons' : 'labels' })).catch((e: unknown) =>
				showError(e)
			);
		} else setOverlay(!overlay);
	}

	return {
		wide,
		/** The docked rail shows labels (wide panels with the setting on). */
		pinned: wide && pinned,
		/** The rail is open over the content (narrow panels). */
		overlay: !wide && overlay,
		setOverlay,
		/** Where focus goes when the sheet closes. */
		returnFocus: () => (returnTo.current?.isConnected ? returnTo.current : null),
		/** True when names are showing, either way. */
		expanded: wide ? pinned : overlay,
		toggle
	};
}
