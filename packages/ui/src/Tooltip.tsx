// A styled tooltip on Radix: 400 ms before the first one, instant while moving between items, shown on keyboard
// focus, Escape dismisses, hoverable (WCAG 1.4.13), collision-aware. It portals into our root, so scroll areas
// (the side rail) never clip it.
import type { ReactElement } from 'react';
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from './shadcn/overlays.tsx';

type Side = 'left' | 'right' | 'bottom' | 'top';

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
	// Each tooltip brings its provider, so any screen (and any test) can use one without app-level setup.
	return (
		<TooltipProvider>
			<TooltipRoot open={disabled ? false : undefined}>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent side={side}>
					{label}
					{hint && (
						<kbd className="rounded-xs bg-bg/20 px-1 font-ui text-2xs leading-4 font-medium text-bg/80">{hint}</kbd>
					)}
				</TooltipContent>
			</TooltipRoot>
		</TooltipProvider>
	);
}
