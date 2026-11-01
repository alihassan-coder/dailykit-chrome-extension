// Memory: what the browser agent remembers about you between chats. The memories themselves stay in the
// background (encrypted in your database); this screen asks for them with memory messages.
import { timeAgo, type MemoryItem, type MemoryRequest, type MemoryResponse, type MemoryStatus } from '@toolbelt/core';
import { Button, EmptyState, IconButton, Switch } from '@toolbelt/ui';
import { Brain, KeyRound, Lock, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';

const ask = (req: MemoryRequest) => browser.runtime.sendMessage(req) as Promise<MemoryResponse>;

function Off({ status }: { status: MemoryStatus }) {
	if (status.state === 'no-embedding-key')
		return (
			<EmptyState
				title="Add an OpenAI or Gemini key to turn memory on"
				body="Memory uses embeddings to find the right notes later. Anthropic and xAI have no embedding service, so memory needs an OpenAI or Gemini key, even when the agent uses Claude or Grok. Everything else works without it."
				action={
					<Button variant="primary" icon={<KeyRound size={16} />} onClick={() => (location.hash = '#ai')}>
						Add a key in AI providers
					</Button>
				}
			/>
		);
	const locked = status.state === 'locked';
	return (
		<EmptyState
			title={locked ? 'Unlock Toolbelt to use memory' : 'Memory needs a Toolbelt account'}
			body={
				locked
					? 'Memories are encrypted with your master password. Unlock Toolbelt to see them and let the agent use them.'
					: 'Memories are stored encrypted in your own database, so memory needs a Toolbelt account.'
			}
			action={
				<Button variant="primary" icon={<Lock size={16} />} onClick={() => (location.hash = '#data')}>
					{locked ? 'Unlock in Data and sync' : 'Set up in Data and sync'}
				</Button>
			}
		/>
	);
}

export function MemorySection() {
	const [status, setStatus] = useState<MemoryStatus | null>(null);
	const [items, setItems] = useState<MemoryItem[]>([]);
	const [query, setQuery] = useState('');
	const [searched, setSearched] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(true);
	const [confirming, setConfirming] = useState(false);

	const send = useCallback(async (req: MemoryRequest) => {
		const res = await ask(req).catch((e: unknown) => ({
			ok: false as const,
			status: null,
			error: e instanceof Error ? e.message : String(e)
		}));
		if (res.status) setStatus(res.status);
		setError(res.ok ? null : res.error);
		return res;
	}, []);

	const show = useCallback(
		async (q: string) => {
			const res = await send({ type: 'memory:list', query: q });
			if (res.ok) {
				setItems(res.items ?? []);
				setSearched(q);
			}
			setBusy(false);
		},
		[send]
	);

	useEffect(() => {
		void ask({ type: 'memory:list' })
			.then((res) => {
				setStatus(res.status);
				if (res.ok) setItems(res.items ?? []);
				else setError(res.error);
			})
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
			.finally(() => setBusy(false));
	}, []);

	function load(q: string) {
		setBusy(true);
		return show(q);
	}

	function search(e: FormEvent) {
		e.preventDefault();
		void load(query.trim());
	}

	async function remove(id: string) {
		setItems((list) => list.filter((m) => m.id !== id));
		await send({ type: 'memory:delete', id });
	}

	async function removeAll() {
		setBusy(true);
		await send({ type: 'memory:delete-all' });
		setConfirming(false);
		setQuery('');
		await load('');
	}

	return (
		<section aria-labelledby="memory-title" className="grid gap-4">
			<div>
				<h2 id="memory-title" className="text-xl font-semibold">
					Memory
				</h2>
				<p className="text-sm text-muted">
					The browser agent can remember things you tell it, like preferences, and use them in later chats.
				</p>
			</div>

			<div className="flex items-start gap-3 rounded-lg border border-line bg-soft p-4 text-sm">
				<Brain size={18} className="mt-0.5 shrink-0 text-muted" />
				<p>
					Memories are encrypted with your master password and kept in your own database. Only the text you and the
					agent wrote is used, never page content, and never passwords or payment details. To pick and find them, notes
					are sent to your own AI provider.
				</p>
			</div>

			{status && status.state !== 'ready' && <Off status={status} />}

			{status?.state === 'ready' && (
				<>
					<div className="grid gap-3 rounded-lg border border-line bg-surface p-5">
						<div className="flex items-center justify-between gap-4">
							<div className="grid gap-0.5">
								<p className="text-base font-medium">Let the agent remember</p>
								<p className="text-sm text-muted">
									Before a task it looks up notes that may help; after it finishes, it saves what is worth keeping.
								</p>
							</div>
							<Switch
								label="Let the agent remember"
								checked={status.enabled}
								onChange={(enabled) => void send({ type: 'memory:set-enabled', enabled })}
							/>
						</div>
						<p className="text-sm text-muted tabular-nums">
							{status.count} {status.count === 1 ? 'memory' : 'memories'} · finds notes with {status.embedder} · picks
							them with {status.extractor}
						</p>
						{status.otherModel > 0 && (
							<p className="text-sm text-muted">
								{status.otherModel} {status.otherModel === 1 ? 'memory was' : 'memories were'} made with another
								embedding model and {status.otherModel === 1 ? 'is' : 'are'} not used by the agent.
							</p>
						)}
						{(error ?? status.lastError) && (
							<p role="alert" className="flex items-start gap-1.5 text-sm text-warn">
								<ShieldAlert size={16} className="mt-0.5 shrink-0" /> {error ?? status.lastError}
							</p>
						)}
					</div>

					<form onSubmit={search} className="flex gap-2">
						<div className="relative min-w-0 flex-1">
							<Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
							<input
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search memories, like “food” or “where I live”"
								aria-label="Search memories"
								className="h-9 w-full rounded-md border border-line bg-bg pr-3 pl-9 text-sm outline-none focus:border-accent"
							/>
						</div>
						<Button type="submit" disabled={busy}>
							Search
						</Button>
						{searched && (
							<IconButton
								label="Clear search"
								onClick={() => {
									setQuery('');
									void load('');
								}}
							>
								<X size={16} />
							</IconButton>
						)}
					</form>

					{items.length === 0 && !busy ? (
						<EmptyState
							title={searched ? 'Nothing matches' : 'No memories yet'}
							body={
								searched
									? 'The agent would not recall anything for this. Try other words.'
									: 'After the agent finishes a task, anything worth remembering shows up here.'
							}
						/>
					) : (
						<ul className="rounded-lg border border-line bg-surface px-5" aria-label="Memories">
							{items.map((m) => (
								<li key={m.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
									<div className="grid min-w-0 flex-1 gap-0.5">
										<p className="text-base break-words">{m.text}</p>
										<p className="text-xs text-muted">
											{timeAgo(m.createdAt)}
											{m.otherModel && ' · made with another embedding model, not used'}
										</p>
									</div>
									<IconButton label={`Delete memory: ${m.text}`} onClick={() => void remove(m.id)}>
										<Trash2 size={16} />
									</IconButton>
								</li>
							))}
						</ul>
					)}

					{status.count + status.otherModel > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							{confirming ? (
								<>
									<Button variant="primary" disabled={busy} onClick={() => void removeAll()}>
										Delete all memories
									</Button>
									<Button variant="quiet" onClick={() => setConfirming(false)}>
										Keep them
									</Button>
									<span className="text-sm text-muted">
										Deletes every memory on all your devices. This cannot be undone.
									</span>
								</>
							) : (
								<Button icon={<Trash2 size={16} />} onClick={() => setConfirming(true)}>
									Delete all…
								</Button>
							)}
						</div>
					)}
				</>
			)}
		</section>
	);
}
