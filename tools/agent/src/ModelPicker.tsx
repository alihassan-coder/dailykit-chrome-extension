// Searchable model picker: type to filter the live model lists, arrow keys to move, Enter to choose.
import { rankCommands } from '@toolbelt/ui';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ModelInfo } from './models.ts';
import type { ModelChoice } from './providers.ts';

const PROVIDER_NAMES: Record<string, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	xai: 'xAI',
	gemini: 'Google'
};

export function ModelPicker({
	models,
	choice,
	onChoose,
	onRefresh,
	refreshing,
	note
}: {
	models: ModelInfo[];
	choice: ModelChoice;
	onChoose: (c: ModelChoice) => void;
	onRefresh: () => void;
	refreshing: boolean;
	note?: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const listId = useId();
	const input = useRef<HTMLInputElement>(null);
	const current = models.find((m) => m.provider === choice.provider && m.id === choice.model);

	const results = useMemo(() => {
		const ranked = rankCommands(
			query,
			models.map((m) => ({
				id: `${m.provider}|${m.id}`,
				title: m.name,
				keywords: [m.id, PROVIDER_NAMES[m.provider]!],
				run: () => {}
			}))
		);
		return ranked.map((r) => models.find((m) => `${m.provider}|${m.id}` === r.id)!);
	}, [query, models]);
	const typed = query.trim();
	// Offer the typed text as a model id only when it looks like one (or nothing matched), not for plain searches.
	const exact = typed && !models.some((m) => m.id === typed) && (!results.length || /[-.\d]/.test(typed));

	function choose(m: ModelInfo | null) {
		if (m) onChoose({ provider: m.provider, model: m.id });
		else if (exact) onChoose({ provider: choice.provider, model: typed });
		setOpen(false);
		setQuery('');
	}

	function onKeyDown(e: KeyboardEvent) {
		const count = results.length + (exact ? 1 : 0);
		if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, count - 1));
		else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
		else if (e.key === 'Enter') choose(results[active] ?? null);
		else if (e.key === 'Escape') setOpen(false);
		else return;
		e.preventDefault();
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => {
					setOpen(true);
					setActive(0);
					setTimeout(() => input.current?.focus());
				}}
				aria-label={`Model: ${current?.name ?? choice.model}. Change model`}
				className="inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-full bg-soft px-3 text-sm text-ink hover:bg-line"
			>
				<span className="truncate">{current?.name ?? choice.model}</span>
				<ChevronDown size={14} className="shrink-0 text-muted" />
			</button>
		);
	}

	let row = -1;
	const groups = [...new Set(results.map((m) => m.provider))];
	return (
		<div className="grid w-full gap-1 rounded-md border border-line bg-surface p-1 shadow-float">
			<input
				ref={input}
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
				}}
				onKeyDown={onKeyDown}
				onBlur={() => setTimeout(() => setOpen(false), 150)}
				placeholder="Search models"
				role="combobox"
				aria-expanded="true"
				aria-controls={listId}
				aria-label="Search models"
				className="h-8 rounded-sm bg-soft px-2 text-sm outline-none"
			/>
			<ul id={listId} role="listbox" className="max-h-64 overflow-y-auto">
				{groups.map((p) => (
					<li key={p} role="presentation">
						<p className="px-2 pt-2 pb-1 text-xs text-muted">{PROVIDER_NAMES[p]}</p>
						<ul role="presentation">
							{results
								.filter((m) => m.provider === p)
								.map((m) => {
									row++;
									const index = row;
									const selected = m.provider === choice.provider && m.id === choice.model;
									return (
										<li
											key={m.id}
											role="option"
											aria-selected={index === active}
											onMouseDown={(e) => e.preventDefault()}
											onMouseMove={() => setActive(index)}
											onClick={() => choose(m)}
											className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-soft"
										>
											<span className="truncate">{m.name}</span>
											{selected ? (
												<span className="text-xs text-accent">Current</span>
											) : (
												<span className="truncate font-mono text-xs text-muted">{m.id}</span>
											)}
										</li>
									);
								})}
						</ul>
					</li>
				))}
				{exact && (
					<li
						role="option"
						aria-selected={active === results.length}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => choose(null)}
						className="cursor-pointer rounded-sm px-2 py-1.5 text-sm aria-selected:bg-soft"
					>
						Use “{typed}”
					</li>
				)}
				{!results.length && !exact && <li className="px-2 py-3 text-sm text-muted">No models yet.</li>}
			</ul>
			<div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-1">
				<span className="truncate text-xs text-muted">{note ?? `${models.length} models`}</span>
				<button
					type="button"
					onMouseDown={(e) => e.preventDefault()}
					onClick={onRefresh}
					className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-accent hover:bg-soft"
				>
					<RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh models
				</button>
			</div>
		</div>
	);
}
