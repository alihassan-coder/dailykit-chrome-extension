// Searchable model picker: type to filter the live model lists, arrow keys to move, Enter to choose.
import { rankCommands, usePortalContainer } from '@toolbelt/ui';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
	const container = usePortalContainer();
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
		else return;
		e.preventDefault();
	}

	// Arrow keys keep the highlighted model in view.
	useEffect(() => {
		if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
	}, [active, open, listId]);

	const label = current?.name ?? choice.model;
	let row = -1;
	const groups = [...new Set(results.map((m) => m.provider))];
	const optId = (i: number) => `${listId}-${i}`;
	return (
		<Popover.Root
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setQuery('');
				setActive(0);
			}}
		>
			<Popover.Trigger
				aria-label={`Model: ${label}. Change model`}
				className="inline-flex h-9 w-fit max-w-full min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-3.5 text-base text-ink shadow-card transition-colors hover:border-muted/50 data-[state=open]:border-accent"
			>
				<span className="truncate">{label}</span>
				<ChevronDown size={16} className="shrink-0 text-muted" />
			</Popover.Trigger>
			<Popover.Portal container={container}>
				<Popover.Content
					align="start"
					sideOffset={6}
					collisionPadding={8}
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						input.current?.focus();
					}}
					className="tb-pop z-50 grid w-[min(340px,calc(100vw-24px))] gap-1 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-float"
				>
					<input
						ref={input}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setActive(0);
						}}
						onKeyDown={onKeyDown}
						placeholder="Search models"
						role="combobox"
						aria-expanded="true"
						aria-controls={listId}
						aria-activedescendant={optId(active)}
						aria-label="Search models"
						className="h-9 rounded-lg border border-line bg-bg px-3 text-base outline-none placeholder:text-muted focus:border-accent focus-visible:outline-none"
					/>
					<ul id={listId} role="listbox" className="max-h-72 overflow-y-auto overscroll-contain">
						{groups.map((p) => (
							<li key={p} role="presentation">
								<p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted">{PROVIDER_NAMES[p]}</p>
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
													id={optId(index)}
													role="option"
													aria-selected={index === active}
													onMouseMove={() => setActive(index)}
													onClick={() => choose(m)}
													className="flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-base aria-selected:bg-soft"
												>
													<span className={`min-w-0 truncate ${selected ? 'font-medium text-accent' : ''}`}>{m.name}</span>
													{selected ? (
														<Check size={16} className="shrink-0 text-accent" />
													) : (
														<span className="max-w-[45%] shrink-0 truncate font-mono text-xs text-muted">{m.id}</span>
													)}
												</li>
											);
										})}
								</ul>
							</li>
						))}
						{exact && (
							<li
								id={optId(results.length)}
								role="option"
								aria-selected={active === results.length}
								onMouseMove={() => setActive(results.length)}
								onClick={() => choose(null)}
								className="min-h-9 cursor-pointer truncate rounded-lg px-2 py-2 text-base aria-selected:bg-soft"
							>
								Use “{typed}”
							</li>
						)}
						{!results.length && !exact && <li className="px-2 py-3 text-sm text-muted">No models match.</li>}
					</ul>
					<div className="flex items-center justify-between gap-2 border-t border-line px-1.5 pt-1.5">
						<span className="min-w-0 truncate text-xs text-muted">{note ?? `${models.length} models`}</span>
						<button
							type="button"
							onClick={onRefresh}
							disabled={refreshing}
							className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-soft disabled:opacity-60"
						>
							<RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
							{refreshing ? 'Refreshing…' : 'Refresh models'}
						</button>
					</div>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
