// Memory: what the browser agent remembers about you between chats. The memories themselves stay in the
// background (encrypted in your database); this screen asks for them with memory messages.
import {
	appError,
	toAppError,
	timeAgo,
	type AppError,
	type MemoryItem,
	type MemoryRequest,
	type MemoryResponse,
	type MemoryStatus
} from '@toolbelt/core';
import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	ConfirmDialog,
	EmptyRow,
	EmptyState,
	ErrorNotice,
	IconButton,
	Input,
	Skeleton,
	Switch,
	cn,
	showError,
	toast
} from '@toolbelt/ui';
import { ChevronRight, KeyRound, Lock, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { SettingsGroup, SettingsHeader, SettingsRow } from './shared.tsx';

/** A failed answer from the background, as an Error the shared error model can read. */
class MemoryFailure extends Error {
	override name = 'MemoryFailure';
}

/** Sends a memory request; a failed answer throws, so every caller handles failures the same way. */
async function ask(req: MemoryRequest): Promise<Extract<MemoryResponse, { ok: true }>> {
	const res = (await browser.runtime.sendMessage(req)) as MemoryResponse;
	if (!res.ok) throw Object.assign(new MemoryFailure(res.error), { status: res.status });
	return res;
}
const statusOf = (e: unknown): MemoryStatus | undefined => (e as { status?: MemoryStatus } | null)?.status;

/** The background's failure text is not shown as is; it is mapped to the shared wording. */
function describe(e: unknown, title: string): AppError {
	const err = toAppError(e);
	return err.code === 'unknown' ? appError('unknown', {}, { title }) : err;
}

type View = {
	status: MemoryStatus | null;
	items: MemoryItem[];
	/** The query the list shows results for ('' = everything). */
	searched: string;
	loading: boolean;
	error: AppError | null;
};

function useMemory() {
	const [view, setView] = useState<View>({ status: null, items: [], searched: '', loading: true, error: null });

	const list = useCallback(async (query: string) => {
		setView((v) => ({ ...v, loading: true }));
		try {
			const res = await ask({ type: 'memory:list', query: query || undefined });
			setView({ status: res.status, items: res.items ?? [], searched: query, loading: false, error: null });
		} catch (e) {
			setView((v) => ({
				...v,
				status: statusOf(e) ?? v.status,
				loading: false,
				error: describe(e, 'Could not load memories')
			}));
		}
	}, []);

	useEffect(() => {
		void list('');
	}, [list]);

	async function remove(item: MemoryItem) {
		const at = view.items.findIndex((m) => m.id === item.id);
		setView((v) => ({ ...v, items: v.items.filter((m) => m.id !== item.id) }));
		try {
			const res = await ask({ type: 'memory:delete', id: item.id });
			setView((v) => ({ ...v, status: res.status }));
		} catch (e) {
			// Put it back where it was.
			setView((v) => {
				const items = v.items.some((m) => m.id === item.id) ? v.items : v.items.toSpliced(Math.max(0, at), 0, item);
				return { ...v, items, status: statusOf(e) ?? v.status };
			});
			showError(describe(e, 'Could not delete the memory'));
		}
	}

	async function removeAll() {
		try {
			await ask({ type: 'memory:delete-all' });
			toast.success('All memories deleted');
		} catch (e) {
			showError(describe(e, 'Could not delete memories'));
		}
		await list('');
	}

	async function setEnabled(enabled: boolean) {
		setView((v) => (v.status?.state === 'ready' ? { ...v, status: { ...v.status, enabled } } : v));
		try {
			const res = await ask({ type: 'memory:set-enabled', enabled });
			setView((v) => ({ ...v, status: res.status }));
		} catch (e) {
			setView((v) => (v.status?.state === 'ready' ? { ...v, status: { ...v.status, enabled: !enabled } } : v));
			showError(describe(e, 'Could not change memory'));
		}
	}

	return { ...view, list, remove, removeAll, setEnabled, dismissError: () => setView((v) => ({ ...v, error: null })) };
}

function Off({ status }: { status: MemoryStatus }) {
	if (status.state === 'no-embedding-key')
		return (
			<EmptyState
				icon={<KeyRound />}
				title="Add an OpenAI or Gemini key to turn memory on"
				body="Memory uses embeddings to find notes later. Anthropic, xAI and Groq have no embedding service, so memory needs an OpenAI or Gemini key, even when the agent uses Claude, Grok or Groq."
				action={
					<Button
						variant="primary"
						size="sm"
						icon={<KeyRound aria-hidden="true" />}
						onClick={() => (location.hash = '#ai')}
					>
						Add a key in AI providers
					</Button>
				}
			/>
		);
	const locked = status.state === 'locked';
	return (
		<EmptyState
			icon={<Lock />}
			title={locked ? 'Unlock Toolbelt to use memory' : 'Memory needs a Toolbelt account'}
			body={
				locked
					? 'Memories are encrypted with your master password. Unlock Toolbelt to see them and let the agent use them.'
					: 'Memories are stored encrypted in your own database, so memory needs a Toolbelt account.'
			}
			action={
				<Button
					variant="primary"
					size="sm"
					icon={<Lock aria-hidden="true" />}
					onClick={() => (location.hash = '#data')}
				>
					{locked ? 'Unlock in Data and sync' : 'Set up in Data and sync'}
				</Button>
			}
		/>
	);
}

function PrivacyNote() {
	const [open, setOpen] = useState(false);
	return (
		<Collapsible open={open} onOpenChange={setOpen} className="px-0.5">
			<CollapsibleTrigger className="inline-flex h-6 items-center gap-1.5 rounded-sm text-sm text-faint hover:text-ink">
				<ShieldCheck size={14} aria-hidden="true" />
				Encrypted with your master password, kept in your own database
				<ChevronRight size={14} aria-hidden="true" className={cn('transition-transform', open && 'rotate-90')} />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<p className="max-w-[60ch] pt-1 pl-5 text-sm text-muted">
					Only the text you and the agent wrote is used, never page content, and never passwords or payment details. To
					pick and find memories, notes are sent to your own AI provider.
				</p>
			</CollapsibleContent>
		</Collapsible>
	);
}

function MemoryRows({ items, onDelete }: { items: MemoryItem[]; onDelete: (m: MemoryItem) => void }) {
	return (
		<ul aria-label="Memories" className="divide-y divide-line">
			{items.map((m) => (
				<li key={m.id} className="group flex min-h-9 items-start gap-3 px-3 py-2 hover:bg-hover">
					<p className="line-clamp-2 min-w-0 flex-1 text-base break-words" title={m.text}>
						{m.text}
					</p>
					<span className="relative flex h-5 shrink-0 items-center justify-end">
						<span className="text-sm text-faint tb-num whitespace-nowrap group-focus-within:invisible group-hover:invisible">
							{m.otherModel ? 'Not used · ' : ''}
							{timeAgo(m.createdAt)}
						</span>
						<span className="absolute right-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
							<IconButton size="xs" label={`Delete memory: ${m.text}`} onClick={() => onDelete(m)}>
								<Trash2 aria-hidden="true" />
							</IconButton>
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

export function MemorySection() {
	const memory = useMemory();
	const { status, items, searched, loading, error } = memory;
	const [query, setQuery] = useState('');
	const lastUpdated = items.reduce((max, m) => Math.max(max, m.createdAt), 0);

	function search(e: FormEvent) {
		e.preventDefault();
		void memory.list(query.trim());
	}

	return (
		<section aria-labelledby="memory-title" className="grid gap-4">
			<SettingsHeader
				id="memory-title"
				title="Memory"
				description="The browser agent remembers things you tell it, like preferences, for later chats."
			/>
			<PrivacyNote />

			{error && (!status || status.state === 'ready') && (
				<ErrorNotice
					error={error}
					onAction={(kind) => kind === 'retry' && void memory.list(searched)}
					onDismiss={memory.dismissError}
				/>
			)}

			{!status && loading && (
				<div className="grid gap-2" aria-busy="true" aria-label="Loading memories">
					<Skeleton className="h-11" />
					<Skeleton className="h-24" />
				</div>
			)}

			{status && status.state !== 'ready' && <Off status={status} />}

			{status?.state === 'ready' && (
				<>
					<SettingsGroup>
						<SettingsRow
							label="Let the agent remember"
							hint="Before a task it looks up notes that may help; after, it saves what is worth keeping."
						>
							<Switch
								label="Let the agent remember"
								checked={status.enabled}
								onChange={(v) => void memory.setEnabled(v)}
							/>
						</SettingsRow>
						{status.lastError && (
							<div className="px-3 py-2.5">
								<ErrorNotice error={describe(new MemoryFailure(status.lastError), 'The last memory update failed')} />
							</div>
						)}
					</SettingsGroup>

					<div className="grid gap-1.5">
						<div className="flex flex-wrap items-center gap-2">
							<p className="min-w-0 flex-1 truncate px-0.5 text-sm text-faint tb-num">
								{status.count} {status.count === 1 ? 'memory' : 'memories'} · finds notes with {status.embedder} · picks
								them with {status.extractor}
								{lastUpdated > 0 && ` · last added ${timeAgo(lastUpdated)}`}
							</p>
							{status.count + status.otherModel > 0 && (
								<ConfirmDialog
									title="Delete every memory?"
									description="Deletes every memory on all your devices. This cannot be undone."
									confirmLabel="Delete all memories"
									onConfirm={() => void memory.removeAll()}
									trigger={
										<Button size="xs" variant="danger-ghost" icon={<Trash2 aria-hidden="true" />}>
											Delete all…
										</Button>
									}
								/>
							)}
						</div>
						{status.otherModel > 0 && (
							<p className="px-0.5 text-sm text-faint">
								{status.otherModel} {status.otherModel === 1 ? 'memory was' : 'memories were'} made with another
								embedding model and {status.otherModel === 1 ? 'is' : 'are'} not used by the agent.
							</p>
						)}

						<form onSubmit={search} className="relative" role="search">
							<Search
								size={14}
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
							/>
							<Input
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search memories, like “food” or “where I live”, then press Enter"
								aria-label="Search memories"
								className="pr-9 pl-8"
							/>
							{searched && (
								<span className="absolute top-1/2 right-1 -translate-y-1/2">
									<IconButton
										size="xs"
										type="button"
										label="Clear search"
										onClick={() => {
											setQuery('');
											void memory.list('');
										}}
									>
										<X aria-hidden="true" />
									</IconButton>
								</span>
							)}
						</form>

						<SettingsGroup>
							{loading && items.length === 0 ? (
								<div className="grid gap-2 p-3" aria-busy="true">
									<Skeleton className="h-5" />
									<Skeleton className="h-5" />
									<Skeleton className="h-5 w-2/3" />
								</div>
							) : items.length === 0 ? (
								<EmptyRow>
									{searched
										? 'Nothing matches. The agent would not recall anything for this; try other words.'
										: 'No memories yet. After the agent finishes a task, anything worth remembering shows up here.'}
								</EmptyRow>
							) : (
								<MemoryRows items={items} onDelete={(m) => void memory.remove(m)} />
							)}
						</SettingsGroup>
					</div>
				</>
			)}
		</section>
	);
}
