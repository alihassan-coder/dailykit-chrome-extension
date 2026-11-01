// AI providers: the user's own API keys for Anthropic, OpenAI, xAI Grok and Google Gemini.
// Keys are stored on this device. Encrypted sync to other devices arrives with accounts.
import {
	PROVIDERS,
	looksLikeKey,
	maskKey,
	resolveApiKeys,
	toolValue,
	type ApiKeys,
	type ProviderId
} from '@toolbelt/core';
import { Button, localArea } from '@toolbelt/ui';
import { ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';

const keysStore = toolValue(localArea, 'ai', 'keys', resolveApiKeys);

function ProviderRow({ id, saved }: { id: ProviderId; saved?: string }) {
	const provider = PROVIDERS.find((p) => p.id === id)!;
	const [draft, setDraft] = useState('');
	const [editing, setEditing] = useState(!saved);
	const [show, setShow] = useState(false);
	const warn = draft.trim() && !looksLikeKey(id, draft);

	async function save() {
		await keysStore.update((k) => ({ ...k, [id]: draft.trim() }));
		setDraft('');
		setEditing(false);
	}

	async function remove() {
		await keysStore.update((k) => {
			const next = { ...k };
			delete next[id];
			return next;
		});
		setEditing(true);
	}

	return (
		<div className="grid gap-3 border-t border-line py-5 first:border-t-0">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="font-medium">
						{provider.name} <span className="text-muted">({provider.product})</span>
					</p>
					<p className="text-sm text-muted">{saved ? `Saved: ${maskKey(saved)}` : 'No key yet'}</p>
				</div>
				<a
					href={provider.consoleUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
				>
					Get a key <ExternalLink size={14} />
				</a>
			</div>

			{editing ? (
				<div className="grid gap-2">
					<div className="flex gap-2">
						<div className="relative min-w-0 flex-1">
							<input
								type={show ? 'text' : 'password'}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={`${provider.keyHint}…`}
								aria-label={`${provider.name} API key`}
								autoComplete="off"
								spellCheck={false}
								className="h-9 w-full rounded-md border border-line bg-bg px-3 pr-9 font-mono text-sm outline-none focus:border-accent"
							/>
							<button
								type="button"
								onClick={() => setShow((s) => !s)}
								aria-label={show ? 'Hide key' : 'Show key'}
								className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-ink"
							>
								{show ? <EyeOff size={16} /> : <Eye size={16} />}
							</button>
						</div>
						<Button variant="primary" disabled={!draft.trim()} onClick={save}>
							Save key
						</Button>
						{saved && (
							<Button variant="quiet" onClick={() => setEditing(false)}>
								Cancel
							</Button>
						)}
					</div>
					{warn && (
						<p className="text-sm text-warn">
							{provider.name} keys usually start with “{provider.keyHint}”. Check you copied the whole key.
						</p>
					)}
				</div>
			) : (
				<div className="flex gap-2">
					<Button onClick={() => setEditing(true)}>Replace key</Button>
					<Button variant="quiet" onClick={remove}>
						Remove key
					</Button>
				</div>
			)}
		</div>
	);
}

export function AiSection() {
	const [keys, setKeys] = useState<ApiKeys>({});

	useEffect(() => {
		void keysStore.get().then(setKeys);
		return keysStore.subscribe(setKeys);
	}, []);

	return (
		<section aria-labelledby="ai-title" className="grid gap-4">
			<div>
				<h2 id="ai-title" className="text-xl font-semibold">
					AI providers
				</h2>
				<p className="text-sm text-muted">
					Use your own API keys. Tools like the browser agent pick from the providers you add here.
				</p>
			</div>
			<div className="flex items-start gap-3 rounded-lg border border-line bg-soft p-4 text-sm">
				<KeyRound size={18} className="mt-0.5 shrink-0 text-muted" />
				<p>
					Keys are stored in this browser only and sent only to their own provider. Encrypted sync to your other devices
					arrives with your Toolbelt account.
				</p>
			</div>
			<div className="rounded-lg border border-line bg-surface px-5">
				{PROVIDERS.map((p) => (
					<ProviderRow key={p.id} id={p.id} saved={keys[p.id]} />
				))}
			</div>
		</section>
	);
}
