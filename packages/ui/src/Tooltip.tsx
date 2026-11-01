// A styled tooltip, Chrome-like timing: 400 ms before the first one, instant while moving between items,
// 100 ms to hide, immediate on keyboard focus, Escape dismisses, stays while hovered (WCAG 1.4.13).
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

const SHOW_DELAY = 400;
const HIDE_DELAY = 100;
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
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	if (disabled) return children;

	const show = (now = false) => {
		clearTimeout(timer.current);
		if (now || Date.now() < warmUntil) setOpen(true);
		else timer.current = setTimeout(() => setOpen(true), SHOW_DELAY);
	};
	const hide = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			setOpen(false);
			warmUntil = Date.now() + 500;
		}, HIDE_DELAY);
	};

	const place: Record<Side, string> = {
		left: 'right-full top-1/2 mr-2 -translate-y-1/2',
		right: 'left-full top-1/2 ml-2 -translate-y-1/2',
		bottom: 'top-full left-1/2 mt-2 -translate-x-1/2'
	};

	return (
		<span
			className="relative inline-flex"
			onMouseEnter={() => show()}
			onMouseLeave={hide}
			onFocus={() => show(true)}
			onBlur={hide}
		>
			{children}
			{open && (
				<span
					id={id}
					role="tooltip"
					onMouseEnter={() => show(true)}
					onMouseLeave={hide}
					className={`absolute z-50 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-bg shadow-float ${place[side]}`}
				>
					{label}
					{hint && <kbd className="font-ui text-[10px] opacity-70">{hint}</kbd>}
				</span>
			)}
		</span>
	);
}
