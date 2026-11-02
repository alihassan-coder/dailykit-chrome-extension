// The side panel's search: a cmdk list (the shared CommandSearch) in a popover that drops under the top bar.
// Ctrl/Cmd+K opens it from anywhere in the panel; arrow keys move, Enter runs, Escape closes and puts focus
// back where it was.
import {
	CommandSearch,
	IconButton,
	KbdGroup,
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
	type Command
} from '@toolbelt/ui';
import { Search } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
/** The search shortcut as text, for tooltips ("Ctrl K", "⌘ K"). */
export const SEARCH_SHORTCUT = `${isMac ? '⌘' : 'Ctrl'} K`;

export function HeaderSearch({
	commands,
	renderIcon,
	children
}: {
	commands: Command[];
	renderIcon?: (c: Command) => ReactNode;
	/** The bar the list drops under. It must hold a <SearchAnchor /> and a <SearchTrigger />. */
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const returnTo = useRef<HTMLElement | null>(null);

	function change(next: boolean) {
		if (next && !open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setOpen(next);
	}

	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			change(true);
		}
	});
	useEffect(() => {
		const listener = (e: KeyboardEvent) => onKey(e);
		window.addEventListener('keydown', listener);
		return () => window.removeEventListener('keydown', listener);
	}, []);

	return (
		<Popover open={open} onOpenChange={change}>
			{children}
			<PopoverContent
				align="center"
				sideOffset={4}
				aria-label="Search"
				className="w-(--radix-popover-trigger-width) max-w-none overflow-hidden p-0"
				onCloseAutoFocus={(e) => {
					const el = returnTo.current;
					returnTo.current = null;
					// Back to what had focus before (a tool's text box, say), not always the search button.
					if (el?.isConnected) {
						e.preventDefault();
						el.focus();
					}
				}}
			>
				<CommandSearch
					commands={commands}
					renderIcon={renderIcon}
					placeholder="Search tools, actions, settings"
					onClose={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** Where the list lines up: the full width of the bar, just under it. Place it inside a `relative` bar. */
export function SearchAnchor() {
	return <PopoverAnchor aria-hidden="true" className="pointer-events-none absolute inset-x-2 bottom-0" />;
}

/** A slim search field on wide panels, an icon button on narrow ones. */
export function SearchTrigger({ wide }: { wide: boolean }) {
	if (!wide) {
		return (
			<PopoverTrigger asChild>
				<IconButton label="Search" hint={SEARCH_SHORTCUT}>
					<Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
				</IconButton>
			</PopoverTrigger>
		);
	}
	return (
		<PopoverTrigger asChild>
			<button
				type="button"
				aria-label="Search tools, actions and settings"
				className="flex h-7 w-48 min-w-0 shrink items-center gap-2 rounded-md border border-line bg-soft px-2 text-sm text-faint transition-colors duration-100 hover:border-line-strong hover:text-muted"
			>
				<Search className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="min-w-0 flex-1 truncate text-left">Search</span>
				<KbdGroup keys={['Mod', 'K']} />
			</button>
		</PopoverTrigger>
	);
}
