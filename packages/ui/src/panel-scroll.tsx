// The side panel gives each tool its own scroll area. Tools reach it here, so a chat can follow new
// messages without fighting someone who scrolled up to read.
import { createContext, useCallback, useContext, useLayoutEffect, useRef, type RefObject } from 'react';

const PanelScroll = createContext<RefObject<HTMLElement | null> | null>(null);

export const PanelScrollProvider = PanelScroll.Provider;

/** The element the current tool scrolls in (null outside the side panel, e.g. in tests). */
export function usePanelScroll(): RefObject<HTMLElement | null> {
	const fallback = useRef<HTMLElement | null>(null);
	return useContext(PanelScroll) ?? fallback;
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
			stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		return () => el.removeEventListener('scroll', onScroll);
	}, [scroller]);

	useLayoutEffect(() => {
		const el = scroller.current;
		if (el && stick.current) el.scrollTop = el.scrollHeight;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return useCallback(() => {
		stick.current = true;
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [scroller]);
}
