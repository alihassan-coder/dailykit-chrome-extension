// Searchable model picker: a compact chip that opens a cmdk list of the live models, grouped by provider.
// Type to filter (by name, id or provider), arrow keys to move, Enter to choose. A typed id that is not
// listed yet can be used as is.
import {
	Button,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandRoot,
	Popover,
	PopoverContent,
	PopoverTrigger,
	cn,
	rankCommands
} from '@toolbelt/ui';
import { Check, ChevronsUpDown, Eye, RefreshCw, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatContext, supportsTools, type ModelInfo } from './models.ts';
import { providerName, type ModelChoice } from './providers.ts';

const keyOf = (m: { provider: string; id: string }) => `${m.provider}|${m.id}`;

export function ModelPicker({
	models,
	choice,
	onChoose,
	onRefresh,
	refreshing,
	note,
	toolsOnly,
	warning,
	className
}: {
	models: ModelInfo[];
	choice: ModelChoice;
	onChoose: (c: ModelChoice) => void;
	onRefresh: () => void;
	refreshing: boolean;
	note?: string | null;
	/** Hide models that cannot call tools (for agents). */
	toolsOnly?: boolean;
	/** Shown as a warning mark on the chip, e.g. "This model isn't in your list". */
	warning?: string | null;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const offered = useMemo(() => (toolsOnly ? models.filter(supportsTools) : models), [models, toolsOnly]);
	const current = models.find((m) => m.provider === choice.provider && m.id === choice.model);

	const results = useMemo(() => {
		const ranked = rankCommands(
			query,
			offered.map((m) => ({
				id: keyOf(m),
				title: m.name,
				keywords: [m.id, providerName(m.provider)],
				run: () => {}
			}))
		);
		const byKey = new Map(offered.map((m) => [keyOf(m), m]));
		return ranked.map((r) => byKey.get(r.id)!).filter(Boolean);
	}, [query, offered]);
	const typed = query.trim();
	// Offer the typed text as a model id only when it looks like one (or nothing matched), not for plain searches.
	const exact = Boolean(typed) && !models.some((m) => m.id === typed) && (!results.length || /[-.\d]/.test(typed));
	const groups = [...new Set(results.map((m) => m.provider))];

	function choose(m: ModelInfo | null) {
		if (m) onChoose({ provider: m.provider, model: m.id });
		else if (exact) onChoose({ provider: choice.provider, model: typed });
		setOpen(false);
		setQuery('');
	}

	const label = current?.name ?? choice.model;
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setQuery('');
			}}
		>
			<PopoverTrigger
				aria-label={`Model: ${label}. Change model`}
				title={warning ?? undefined}
				className={cn(
					'inline-flex h-6 max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-sm text-muted outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:bg-hover data-[state=open]:text-ink',
					className
				)}
			>
				{warning && <TriangleAlert className="size-3.5 shrink-0 text-warn" aria-hidden="true" />}
				<span className="truncate">{label}</span>
				<ChevronsUpDown className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(320px,calc(100vw-16px))] p-0">
				<CommandRoot
					shouldFilter={false}
					loop
					label="Search models"
					defaultValue={keyOf({ provider: choice.provider, id: choice.model })}
				>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search models"
						aria-label="Search models"
						autoFocus
					/>
					<CommandList className="max-h-72">
						{!exact && <CommandEmpty>No models match.</CommandEmpty>}
						{groups.map((p) => (
							<CommandGroup key={p} heading={providerName(p)}>
								{results
									.filter((m) => m.provider === p)
									.map((m) => {
										const selected = m.provider === choice.provider && m.id === choice.model;
										const context = formatContext(m.context);
										return (
											<CommandItem
												key={keyOf(m)}
												value={keyOf(m)}
												onSelect={() => choose(m)}
												title={m.id}
												className="h-7 gap-2"
											>
												<span className={cn('min-w-0 flex-1 truncate', selected && 'font-medium text-ink')}>
													{m.name}
												</span>
												<span className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
													{context && <span className="tb-num">{context}</span>}
													{m.vision && (
														<>
															<Eye className="size-3.5" aria-hidden="true" />
															<span className="sr-only">reads images</span>
														</>
													)}
												</span>
												<Check
													className={cn('size-3.5 text-accent-ink', !selected && 'invisible')}
													aria-hidden="true"
												/>
											</CommandItem>
										);
									})}
							</CommandGroup>
						))}
						{exact && (
							<CommandGroup>
								<CommandItem value="__typed__" onSelect={() => choose(null)} className="h-7">
									<span className="truncate">Use “{typed}”</span>
								</CommandItem>
							</CommandGroup>
						)}
					</CommandList>
					<div className="flex h-8 items-center gap-2 border-t border-line pr-1 pl-2.5">
						<span
							className={cn('tb-num min-w-0 flex-1 truncate text-xs', note ? 'text-warn' : 'text-faint')}
							title={note ?? undefined}
						>
							{note ?? `${offered.length} ${offered.length === 1 ? 'model' : 'models'}`}
						</span>
						<Button
							size="xs"
							variant="ghost"
							onClick={onRefresh}
							loading={refreshing}
							icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
						>
							{refreshing ? 'Refreshing…' : 'Refresh'}
						</Button>
					</div>
				</CommandRoot>
			</PopoverContent>
		</Popover>
	);
}
