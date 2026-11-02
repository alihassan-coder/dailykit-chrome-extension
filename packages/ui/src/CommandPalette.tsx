// Ctrl/Cmd+K: type a few letters, press Enter. Arrow keys move, Escape closes. Built on cmdk (shadcn Command)
// in a Radix Dialog, so focus is trapped and returns to where it was. Ranking stays ours (rankCommands).
import { Dialog as RDialog } from 'radix-ui';
import { useMemo, useState, type ReactNode } from 'react';
import { rankCommands, type Command as PaletteCommand } from './palette.ts';
import { usePortalContainer } from './portal.tsx';
import {
	CommandRoot,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut
} from './shadcn/command.tsx';

interface PaletteProps {
	onClose: () => void;
	commands: PaletteCommand[];
	renderIcon?: (c: PaletteCommand) => ReactNode;
	placeholder?: string;
}

/** Mounts fresh every time it opens, so it always starts with an empty search. */
export function CommandPalette({ open, ...props }: PaletteProps & { open: boolean }) {
	const container = usePortalContainer();
	return (
		<RDialog.Root open={open} onOpenChange={(o) => !o && props.onClose()}>
			<RDialog.Portal container={container}>
				<RDialog.Overlay className="tb-fade fixed inset-0 z-50 bg-scrim" />
				<RDialog.Content
					aria-describedby={undefined}
					className="tb-pop fixed inset-x-2 top-2 z-50 mx-auto max-w-xl overflow-hidden rounded-2xl bg-raised shadow-dialog outline-none"
				>
					<RDialog.Title className="sr-only">Command palette</RDialog.Title>
					{open && <CommandSearch {...props} />}
				</RDialog.Content>
			</RDialog.Portal>
		</RDialog.Root>
	);
}

/** The searchable list on its own, for embedding (the side panel's header search uses it in a popover). */
export function CommandSearch({
	onClose,
	commands,
	renderIcon,
	placeholder = 'Search tools and settings'
}: PaletteProps) {
	const [query, setQuery] = useState('');
	const results = useMemo(() => rankCommands(query, commands), [query, commands]);
	const groups = [...new Set(results.map((c) => c.group))];

	function run(c: PaletteCommand) {
		onClose();
		c.run();
	}

	return (
		<CommandRoot shouldFilter={false} loop label="Command palette">
			<CommandInput
				autoFocus
				value={query}
				onValueChange={setQuery}
				placeholder={placeholder}
				aria-label={placeholder}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						e.preventDefault();
						onClose();
					}
				}}
			/>
			<CommandList>
				<CommandEmpty>Nothing matches “{query}”.</CommandEmpty>
				{groups.map((group) => (
					<CommandGroup key={group ?? '_'} heading={group}>
						{results
							.filter((c) => c.group === group)
							.map((c) => (
								<CommandItem key={c.id} value={c.id} onSelect={() => run(c)}>
									{renderIcon?.(c)}
									<span className="min-w-0 flex-1 truncate">{c.title}</span>
									{c.hint && <CommandShortcut>{c.hint}</CommandShortcut>}
								</CommandItem>
							))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandRoot>
	);
}
