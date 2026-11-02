// The one 40 px bar above the tool: which tool you are in, search, and a "⋯" menu for the rest.
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
	Kbd,
	KbdGroup,
	Logo
} from '@toolbelt/ui';
import { Keyboard, Lock, MoreHorizontal, Palette, Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { SearchAnchor, SearchTrigger } from '../../shell/HeaderSearch.tsx';
import { openDashboard } from '../../shell/commands.ts';
import { ToolIcon } from './ToolIcon.tsx';

const ICON = { className: 'size-4', strokeWidth: 1.75, 'aria-hidden': true } as const;

export function TopBar({
	tool,
	wide,
	onLock
}: {
	tool: { id: string; name: string } | undefined;
	wide: boolean;
	onLock: () => void;
}) {
	const [shortcuts, setShortcuts] = useState(false);
	const more = useRef<HTMLButtonElement>(null);

	return (
		<header className="relative flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface pr-1.5 pl-3">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{tool ? <ToolIcon id={tool.id} size={16} /> : <Logo size={16} />}
				<h1 className="min-w-0 truncate text-lg font-medium" title={tool?.name}>
					{tool?.name ?? 'Toolbelt'}
				</h1>
			</div>

			<SearchTrigger wide={wide} />

			<DropdownMenu>
				<DropdownMenuTrigger asChild ref={more}>
					<IconButton label="More">
						<MoreHorizontal {...ICON} />
					</IconButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => openDashboard()}>
						<Settings2 {...ICON} />
						Open dashboard
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => openDashboard('appearance')}>
						<Palette {...ICON} />
						Appearance
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setShortcuts(true)}>
						<Keyboard {...ICON} />
						Keyboard shortcuts
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onLock}>
						<Lock {...ICON} />
						Lock now
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} onClosed={() => more.current?.focus()} />
			<SearchAnchor />
		</header>
	);
}

const SHORTCUTS: { label: string; keys: string[] }[] = [
	{ label: 'Search tools, actions and settings', keys: ['Mod', 'K'] },
	{ label: 'Open or collapse the toolbar', keys: ['['] },
	{ label: 'Move between tools in the toolbar', keys: ['↑', '↓'] },
	{ label: 'Open the focused tool', keys: ['Enter'] },
	{ label: 'Close search, menus and dialogs', keys: ['Esc'] }
];

function ShortcutsDialog({
	open,
	onOpenChange,
	onClosed
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onClosed: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-sm"
				onCloseAutoFocus={(e) => {
					e.preventDefault();
					onClosed();
				}}
			>
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>Work in the side panel without the mouse.</DialogDescription>
				</DialogHeader>
				<dl className="grid">
					{SHORTCUTS.map((s) => (
						<div
							key={s.label}
							className="flex h-8 items-center justify-between gap-3 border-b border-line last:border-b-0"
						>
							<dt className="min-w-0 truncate text-base text-ink">{s.label}</dt>
							<dd className="shrink-0">{s.keys.length > 1 ? <KbdGroup keys={s.keys} /> : <Kbd>{s.keys[0]}</Kbd>}</dd>
						</div>
					))}
				</dl>
			</DialogContent>
		</Dialog>
	);
}
