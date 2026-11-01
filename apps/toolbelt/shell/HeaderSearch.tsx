// The search pill at the top of the side panel: tools, settings and actions, as you type.
// Ctrl/Cmd+K focuses it from anywhere in the panel; arrow keys move, Enter runs, Escape clears.
import { Kbd, rankCommands, type Command } from '@toolbelt/ui';
import { Search } from 'lucide-react';
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export const HeaderSearch = forwardRef<
	HTMLInputElement,
	{ commands: Command[]; renderIcon?: (c: Command) => ReactNode; shortcut: string }
>(function HeaderSearch({ commands, renderIcon, shortcut }, ref) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const listId = useId();
	const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(closing.current), []);
	const results = useMemo(() => rankCommands(query, commands).slice(0, 8), [query, commands]);

	function run(c: Command | undefined) {
		if (!c) return;
		setQuery('');
		setOpen(false);
		c.run();
	}

	function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'ArrowDown') {
			if (!open) setOpen(true);
			else setActive((i) => Math.min(i + 1, results.length - 1));
		}
		else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
		else if (e.key === 'Enter' && open) run(results[active]);
		else if (e.key === 'Escape') {
			setQuery('');
			setOpen(false);
			e.currentTarget.blur();
		} else return;
		e.preventDefault();
	}

	return (
		<div className="@container relative min-w-0 flex-1">
			<label className="flex h-9 items-center gap-2 rounded-full border border-transparent bg-soft px-3 text-muted transition-colors duration-100 hover:border-line focus-within:border-accent focus-within:bg-surface focus-within:shadow-[0_0_0_3px_var(--tb-accent-soft)]">
				<Search size={16} aria-hidden="true" className="shrink-0" />
				<input
					ref={ref}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActive(0);
						setOpen(true);
					}}
					onFocus={() => clearTimeout(closing.current)}
					onBlur={() => {
						closing.current = setTimeout(() => setOpen(false), 120);
					}}
					onKeyDown={onKeyDown}
					placeholder="Search tools, settings, actions"
					aria-label="Search tools, settings and actions"
					role="combobox"
					aria-expanded={open}
					aria-controls={listId}
					aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
					aria-autocomplete="list"
					className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
				/>
				{!query && (
					<span className="hidden @[260px]:inline-flex">
						<Kbd>{shortcut}</Kbd>
					</span>
				)}
			</label>
			{open && (
				<ul
					id={listId}
					role="listbox"
					className="tb-pop absolute top-full right-0 left-0 z-50 mt-1.5 max-h-[min(20rem,70dvh)] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-float"
				>
					{results.map((c, i) => (
						<li
							key={c.id}
							id={`${listId}-${i}`}
							role="option"
							aria-selected={i === active}
							onMouseDown={(e) => e.preventDefault()}
							onMouseMove={() => setActive(i)}
							onClick={() => run(c)}
							className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-base aria-selected:bg-soft"
						>
							{renderIcon?.(c)}
							<span className="min-w-0 flex-1 truncate">{c.title}</span>
							{c.hint && c.hint !== 'Tool' && <span className="shrink-0 text-xs text-muted">{c.hint}</span>}
						</li>
					))}
					{!results.length && <li className="px-2 py-4 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
				</ul>
			)}
		</div>
	);
});
