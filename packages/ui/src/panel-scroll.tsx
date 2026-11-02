// The side panel gives each tool its own scroll area. Tools reach it here, so a chat can follow new
// messages without fighting someone who scrolled up to read.
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const PanelScroll = createContext<RefObject<HTMLElement | null> | null>(null);

export const PanelScrollProvider = PanelScroll.Provider;

/** The element the current tool scrolls in (null outside the side panel, e.g. in tests). */
export function usePanelScroll(): RefObject<HTMLElement | null> {
	const fallback = useRef<HTMLElement | null>(null);
	return useContext(PanelScroll) ?? fallback;
}

const nearBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
function pinToBottom(el: HTMLElement | null) {
	if (el) el.scrollTop = el.scrollHeight;
}

/**
 * Keeps the scroll area pinned to the bottom while `deps` change, but only when the reader is already
 * near the bottom. Call the returned function (e.g. on send) to pin it again.
 */
export function useStickToBottom(deps: unknown[]): () => void {
	const scroller = usePanelScroll();
	const stick = useRef(true);

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const onScroll = () => {
			stick.current = nearBottom(el);
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		return () => el.removeEventListener('scroll', onScroll);
	}, [scroller]);

	useLayoutEffect(() => {
		if (stick.current) pinToBottom(scroller.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	// One stable function for the component's lifetime; the scroll area's ref object never changes.
	const [pin] = useState(() => () => {
		stick.current = true;
		pinToBottom(scroller.current);
	});
	return pin;
}
