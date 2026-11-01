// A styled tooltip, Chrome-like timing: 400 ms before the first one, instant while moving between items,
// 100 ms to hide, immediate on keyboard focus (not on click), Escape dismisses, stays while hovered (WCAG 1.4.13).
// It floats in a portal so scroll areas (the side rail) never clip it.
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from './portal.tsx';

const SHOW_DELAY = 400;
const HIDE_DELAY = 100;
const GAP = 8;
// Shared across tooltips: once one is open, the next one opens without waiting.
let warmUntil = 0;

type Side = 'left' | 'right' | 'bottom';

export function Tooltip({
	label,
	hint,
	side = 'left',
	disabled,
	children
}: {
	label: string;
	hint?: string;
	side?: Side;
	disabled?: boolean;
	/** The control the tooltip names; it should carry the same text as its aria-label. */
	children: ReactElement;
}) {
	const id = useId();
	const container = usePortalContainer();
	const anchor = useRef<HTMLSpanElement>(null);
	const [at, setAt] = useState<{ x: number; y: number } | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const open = at !== null && !disabled;

	useEffect(() => () => clearTimeout(timer.current), []);
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null);
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	const place = () => {
		const r = anchor.current?.getBoundingClientRect();
		if (!r) return;
		if (side === 'left') setAt({ x: r.left - GAP, y: r.top + r.height / 2 });
		else if (side === 'right') setAt({ x: r.right + GAP, y: r.top + r.height / 2 });
		else setAt({ x: r.left + r.width / 2, y: r.bottom + GAP });
	};
	const show = (now = false) => {
		if (disabled) return;
		clearTimeout(timer.current);
		if (now || Date.now() < warmUntil) place();
		else timer.current = setTimeout(place, SHOW_DELAY);
	};
	const hide = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			setAt(null);
			warmUntil = Date.now() + 500;
		}, HIDE_DELAY);
	};

	const shift: Record<Side, string> = {
		left: '-translate-x-full -translate-y-1/2',
		right: '-translate-y-1/2',
		bottom: '-translate-x-1/2'
	};

	// The wrapper is the same whether or not the tooltip is enabled, so toggling never remounts the control.
	return (
		<span
			ref={anchor}
			className="inline-flex"
			aria-describedby={open ? id : undefined}
			onMouseEnter={() => show()}
			onMouseLeave={hide}
			onFocus={(e) => {
				// Keyboard focus only; a mouse click should not flash a tooltip.
				if ((e.target as HTMLElement).matches(':focus-visible')) show(true);
			}}
			onBlur={hide}
		>
			{children}
			{open &&
				createPortal(
					<span
						id={id}
						role="tooltip"
						onMouseEnter={() => show(true)}
						onMouseLeave={hide}
						style={{ left: at.x, top: at.y }}
						className={`tb-pop pointer-events-none fixed z-[100] flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-sm font-medium whitespace-nowrap text-bg shadow-float ${shift[side]}`}
					>
						{label}
						{hint && (
							<kbd className="rounded-sm bg-bg/20 px-1 font-mono text-xs leading-4 text-bg/80">{hint}</kbd>
						)}
					</span>,
					container ?? document.body
				)}
		</span>
	);
}
