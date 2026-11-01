// Shared AI credentials: provider API keys or a Claude subscription setup token.
// Credentials use the existing local storage and optional encrypted account sync.
import { testClaudeConnection } from '@toolbelt/ai';
import {
	PROVIDERS,
	isClaudeSetupToken,
	looksLikeClaudeSetupToken,
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
	const [mode, setMode] = useState(saved && isClaudeSetupToken(saved) ? 'subscription' : 'api');
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const subscription = id === 'anthropic' && mode === 'subscription';
	const label = subscription ? 'setup token' : 'API key';
	const valid = subscription ? looksLikeClaudeSetupToken(draft) : !!draft.trim();

	async function testConnection() {
		if (!saved) return;
		setTesting(true);
		setTestResult(null);
		try {
			setTestResult(await testClaudeConnection(saved));
		} catch (error) {
			setTestResult(error instanceof Error ? error.message : 'Connection test failed.');
		} finally {
			setTesting(false);
		}
	}
	const warn = draft.trim() && !looksLikeKey(id, draft);

	async function save() {
		if (!valid) return;
		setSaveError(null);
		try {
			await keysStore.update((k) => ({ ...k, [id]: draft.trim() }));
		} catch {
			setSaveError('Could not save this credential. Try again.');
			return;
		}
		setTestResult(null);
		setDraft('');
		setEditing(false);
	}

	async function remove() {
		await keysStore.update((k) => {
			const next = { ...k };
			delete next[id];
			return next;
		});
		setDraft('');
		setTestResult(null);
		setEditing(true);
	}

	return (
		<div className="grid gap-3 border-t border-line py-5 first:border-t-0">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="font-medium">
						{provider.name} <span className="text-muted">({provider.product})</span>
					</p>
					<p className="text-sm text-muted">
						{saved
							? `${id === 'anthropic' && isClaudeSetupToken(saved) ? 'Claude subscription' : 'API key'} saved: ${maskKey(saved)}`
							: 'No credential yet'}
					</p>
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

			{id === 'anthropic' && editing && (
				<div className="grid gap-2">
					<label className="grid gap-1 text-sm">
						Connection method
						<select
							aria-label="Anthropic connection method"
							value={mode}
							onChange={(e) => {
								setMode(e.target.value);
								setDraft('');
								setShow(false);
								setTestResult(null);
							}}
							className="h-9 rounded-md border border-line bg-bg px-3"
						>
							<option value="api">API key</option>
							<option value="subscription">Claude subscription (setup token)</option>
						</select>
					</label>
					{subscription && (
						<p className="text-sm text-muted">
							Run <code>claude setup-token</code> in your terminal with Claude Code installed, sign in with your Claude
							subscription, then paste the full <code>sk-ant-oat01-…</code> token here. Subscription usage limits apply.
							If the token expires or is revoked, generate a new one and replace it here.
						</p>
					)}
				</div>
			)}
			{editing ? (
				<div className="grid gap-2">
					<div className="flex gap-2">
						<div className="relative min-w-0 flex-1">
							<input
								type={show ? 'text' : 'password'}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={`${subscription ? 'sk-ant-oat01-' : provider.keyHint}…`}
								aria-label={`${provider.name} ${label}`}
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
						<Button variant="primary" disabled={!valid} onClick={save}>
							Save {subscription ? 'token' : 'key'}
						</Button>
						{saved && (
							<Button variant="quiet" onClick={() => setEditing(false)}>
								Cancel
							</Button>
						)}
					</div>
					{(subscription ? draft.trim() && !valid : warn) && (
						<p className="text-sm text-warn">
							{subscription
								? 'Paste the complete setup token starting with sk-ant-oat01- (at least 80 characters, without spaces).'
								: `${provider.name} keys usually start with “${provider.keyHint}”. Check you copied the whole key.`}
						</p>
					)}
				</div>
			) : (
				<div className="flex gap-2">
					<Button
						disabled={testing}
						onClick={() => {
							setMode(saved && isClaudeSetupToken(saved) ? 'subscription' : 'api');
							setEditing(true);
						}}
					>
						Replace {saved && isClaudeSetupToken(saved) ? 'token' : 'key'}
					</Button>
					<Button variant="quiet" disabled={testing} onClick={remove}>
						Remove {saved && isClaudeSetupToken(saved) ? 'token' : 'key'}
					</Button>
					{id === 'anthropic' && (
						<Button disabled={testing} onClick={testConnection}>
							{testing ? 'Testing…' : 'Test connection'}
						</Button>
					)}
				</div>
			)}
			{id === 'anthropic' && saved && !editing && (
				<p className="text-sm text-muted">
					Test connection sends a small Claude request and uses your account allowance.
				</p>
			)}
			{testResult && (
				<p role="status" className="text-sm">
					{testResult}
				</p>
			)}
			{saveError && (
				<p role="alert" className="text-sm text-warn">
					{saveError}
				</p>
			)}
		</div>
	);
}

export function AiSection() {
	const [keys, setKeys] = useState<ApiKeys | null>(null);

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
					Connect with your Claude subscription or your own API keys. Tools like the browser agent use the providers you
					add here.
				</p>
			</div>
			<div className="flex items-start gap-3 rounded-lg border border-line bg-soft p-4 text-sm">
				<KeyRound size={18} className="mt-0.5 shrink-0 text-muted" />
				<p>
					Credentials are stored locally in this browser and sent to their own provider. If you enable account sync,
					credentials sync encrypted to your database.
				</p>
			</div>
			<div className="rounded-lg border border-line bg-surface px-5">
				{keys && PROVIDERS.map((p) => <ProviderRow key={p.id} id={p.id} saved={keys[p.id]} />)}
			</div>
		</section>
	);
}
