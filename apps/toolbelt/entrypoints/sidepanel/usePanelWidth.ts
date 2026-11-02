import { useLayoutEffect, useState, type RefObject } from 'react';

/** The element's width in CSS px, kept current with a ResizeObserver (it reports the first size right away). */
export function usePanelWidth(ref: RefObject<HTMLElement | null>): number {
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? el.clientWidth)));
		ro.observe(el);
		return () => ro.disconnect();
	}, [ref]);
	return width;
}
