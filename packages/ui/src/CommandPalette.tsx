// Ctrl/Cmd+K: type a few letters, press Enter. Arrow keys move, Escape closes.
import { Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { rankCommands, type Command } from './palette.ts';

interface PaletteProps {
	onClose: () => void;
	commands: Command[];
	renderIcon?: (c: Command) => ReactNode;
}

/** Mounts fresh every time it opens, so it always starts with an empty search. */
export function CommandPalette({ open, ...props }: PaletteProps & { open: boolean }) {
	return open ? <Palette {...props} /> : null;
}

function Palette({ onClose, commands, renderIcon }: PaletteProps) {
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const listId = useId();
	const results = useMemo(() => rankCommands(query, commands), [query, commands]);

	function run(c: Command | undefined) {
		if (!c) return;
		onClose();
		c.run();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
		else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
		else if (e.key === 'Enter') run(results[active]);
		else if (e.key === 'Escape') onClose();
		else return;
		e.preventDefault();
	}

	return (
		<div
			className="fixed inset-0 z-50 grid content-start bg-ink/25 px-3 pt-16"
			onMouseDown={(e) => e.target === e.currentTarget && onClose()}
		>
			<div
				role="dialog"
				aria-label="Command palette"
				className="overflow-hidden rounded-lg border border-line bg-surface shadow-float"
			>
				<div className="flex items-center gap-2 border-b border-line px-3">
					<Search size={16} className="text-muted" aria-hidden="true" />
					<input
						autoFocus
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setActive(0);
						}}
						onKeyDown={onKeyDown}
						placeholder="Search tools and settings"
						aria-label="Search tools and settings"
						role="combobox"
						aria-expanded="true"
						aria-controls={listId}
						aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
						className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
					/>
				</div>
				<ul id={listId} role="listbox" className="max-h-80 overflow-y-auto p-1">
					{results.map((c, i) => (
						<li
							key={c.id}
							id={`${listId}-${c.id}`}
							role="option"
							aria-selected={i === active}
							onMouseMove={() => setActive(i)}
							onClick={() => run(c)}
							className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm aria-selected:bg-soft"
						>
							{renderIcon?.(c)}
							<span className="min-w-0 flex-1 truncate">{c.title}</span>
							{c.hint && <span className="text-xs text-muted">{c.hint}</span>}
						</li>
					))}
					{!results.length && (
						<li className="px-2.5 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>
					)}
				</ul>
			</div>
		</div>
	);
}
