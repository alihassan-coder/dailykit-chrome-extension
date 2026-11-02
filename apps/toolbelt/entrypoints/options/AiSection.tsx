// Shared AI credentials: provider API keys or a Claude subscription setup token.
// Credentials use the existing local storage and optional encrypted account sync.
import { testClaudeConnection } from '@toolbelt/ai';
import {
	PROVIDERS,
	appError,
	isClaudeSetupToken,
	looksLikeClaudeSetupToken,
	looksLikeKey,
	maskKey,
	timeAgo,
	toAppError,
	type AppError,
	type ErrorContext,
	type ProviderId
} from '@toolbelt/core';
import {
	Badge,
	Button,
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	ErrorNotice,
	IconButton,
	Label,
	Select,
	Skeleton,
	showError,
	toast
} from '@toolbelt/ui';
import { ExternalLink, KeyRound, MoreHorizontal, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { useReducer, useState, type FormEvent } from 'react';
import { SecretInput, SettingsGroup, SettingsHeader, keysStore, useApiKeys } from './shared.tsx';

type Provider = (typeof PROVIDERS)[number];
/** How Anthropic is connected: an API key, or a Claude subscription setup token. Other providers: always 'api'. */
type Method = 'api' | 'subscription';

type Test =
	{ kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; at: number } | { kind: 'failed'; at: number; error: AppError };

type RowState = { dialog: 'none' | 'edit' | 'remove'; test: Test };
type RowAction =
	| { type: 'dialog'; dialog: RowState['dialog'] }
	| { type: 'test'; test: Test }
	| { type: 'saved' }
	| { type: 'removed' };

function rowReducer(state: RowState, action: RowAction): RowState {
	switch (action.type) {
		case 'dialog':
			return { ...state, dialog: action.dialog };
		case 'test':
			return { ...state, test: action.test };
		case 'saved':
		case 'removed':
			return { dialog: 'none', test: { kind: 'idle' } };
	}
}

const methodOf = (id: ProviderId, saved?: string): Method =>
	id === 'anthropic' && saved && isClaudeSetupToken(saved) ? 'subscription' : 'api';
const credentialName = (m: Method) => (m === 'subscription' ? 'token' : 'key');

/** testClaudeConnection throws plain, already-safe sentences; map the known ones to the shared wording. */
function testFailure(error: unknown, ctx: ErrorContext): AppError {
	const e = toAppError(error, ctx);
	if (e.code !== 'unknown') return e;
	const msg = error instanceof Error ? error.message : '';
	if (/rejected/i.test(msg)) return appError('auth_invalid', ctx);
	if (/usage limit/i.test(msg)) return appError('rate_limited', ctx);
	return appError('unknown', ctx, { title: `${ctx.provider ?? 'The provider'} could not complete the test` });
}

function KeyDialog({
	provider,
	saved,
	open,
	onOpenChange,
	onSaved
}: {
	provider: Provider;
	saved?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [method, setMethod] = useState<Method>(methodOf(provider.id, saved));
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<AppError | null>(null);
	const [busy, setBusy] = useState(false);
	const subscription = provider.id === 'anthropic' && method === 'subscription';
	const label = subscription ? 'setup token' : 'API key';
	const value = draft.trim();
	const valid = subscription ? looksLikeClaudeSetupToken(draft) : !!value;
	const warning = !value
		? null
		: subscription
			? valid
				? null
				: 'Paste the complete setup token starting with sk-ant-oat01- (at least 80 characters, without spaces).'
			: looksLikeKey(provider.id, draft)
				? null
				: `${provider.name} keys usually start with “${provider.keyHint}”. Check you copied the whole key.`;

	async function save(e: FormEvent) {
		e.preventDefault();
		if (!valid) return;
		setBusy(true);
		setError(null);
		try {
			await keysStore.update((k) => ({ ...k, [provider.id]: value }));
			toast.success(`${provider.name} ${label} saved`);
			setDraft('');
			onSaved();
		} catch (err) {
			setError(toAppError(err, { provider: provider.name }));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={save} className="grid gap-3">
					<DialogHeader>
						<DialogTitle>
							{saved ? 'Replace' : 'Add'} {provider.name} {credentialName(method)}
						</DialogTitle>
						<DialogDescription>
							Stored in this browser and sent only to {provider.name}.{' '}
							<a
								href={provider.consoleUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-accent-ink hover:underline"
							>
								Get a key <ExternalLink size={12} aria-hidden="true" />
							</a>
						</DialogDescription>
					</DialogHeader>

					{provider.id === 'anthropic' && (
						<div className="grid gap-1.5">
							<Label>Connection method</Label>
							<Select<Method>
								label="Anthropic connection method"
								value={method}
								onChange={(m) => {
									setMethod(m);
									setDraft('');
									setError(null);
								}}
								options={[
									{ value: 'api', label: 'API key', description: 'Billed to your Anthropic Console account' },
									{
										value: 'subscription',
										label: 'Claude subscription (setup token)',
										description: 'Uses your Claude plan’s usage limits'
									}
								]}
							/>
							{subscription && (
								<p className="text-sm text-muted">
									Run <code className="font-mono">claude setup-token</code> with Claude Code installed, sign in with
									your Claude subscription, then paste the full <code className="font-mono">sk-ant-oat01-…</code> token.
									If it expires or is revoked, generate a new one and replace it here.
								</p>
							)}
						</div>
					)}

					<div className="grid gap-1.5">
						<Label htmlFor={`key-${provider.id}`}>{subscription ? 'Setup token' : 'API key'}</Label>
						<SecretInput
							id={`key-${provider.id}`}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={`${subscription ? 'sk-ant-oat01-' : provider.keyHint}…`}
							aria-label={`${provider.name} ${label}`}
							aria-invalid={(subscription && !!warning) || undefined}
							className="font-mono text-sm"
							autoFocus
						/>
						{warning && <p className="text-sm text-warn">{warning}</p>}
					</div>

					{error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}

					<DialogFooter>
						<Button variant="quiet" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={!valid} loading={busy}>
							Save {subscription ? 'token' : 'key'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function StatusBadge({ saved, test }: { saved?: string; test: Test }) {
	if (!saved) return <Badge tone="neutral">Not set</Badge>;
	if (test.kind === 'ok') return <Badge tone="ok">Connected</Badge>;
	if (test.kind === 'failed' && test.error.code === 'auth_invalid') return <Badge tone="danger">Invalid</Badge>;
	if (test.kind === 'failed') return <Badge tone="warn">Test failed</Badge>;
	return <Badge tone="outline">Saved</Badge>;
}

function ProviderRow({ provider, saved }: { provider: Provider; saved?: string }) {
	const [state, dispatch] = useReducer(rowReducer, { dialog: 'none', test: { kind: 'idle' } });
	const method = methodOf(provider.id, saved);
	const noun = credentialName(method);
	const canTest = provider.id === 'anthropic' && !!saved;
	const ctx: ErrorContext = { provider: provider.name, setupToken: method === 'subscription' };
	const testing = state.test.kind === 'testing';

	async function test() {
		if (!saved) return;
		dispatch({ type: 'test', test: { kind: 'testing' } });
		try {
			const result = await testClaudeConnection(saved);
			dispatch({ type: 'test', test: { kind: 'ok', at: Date.now() } });
			toast.success(`${provider.name} connected`, { description: result });
		} catch (error) {
			dispatch({ type: 'test', test: { kind: 'failed', at: Date.now(), error: testFailure(error, ctx) } });
		}
	}

	async function remove() {
		try {
			await keysStore.update((k) => {
				const next = { ...k };
				delete next[provider.id];
				return next;
			});
			dispatch({ type: 'removed' });
			toast.success(`${provider.name} ${noun} removed`);
		} catch (error) {
			dispatch({ type: 'dialog', dialog: 'none' });
			showError(error, { ctx });
		}
	}

	const tested = state.test.kind === 'ok' || state.test.kind === 'failed' ? state.test.at : null;

	return (
		<li className="grid">
			<div className="flex min-h-11 items-center gap-3 px-3 py-2">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<p className="truncate text-base font-medium">
						{provider.name} <span className="font-normal text-faint">{provider.product}</span>
					</p>
					<StatusBadge saved={saved} test={state.test} />
				</div>
				{saved && (
					<span className="flex min-w-0 items-center gap-3 text-sm text-faint max-sm:hidden">
						{method === 'subscription' && <span>Subscription</span>}
						<code className="truncate font-mono text-sm text-muted">{maskKey(saved)}</code>
						{canTest && (
							<span className="tb-num whitespace-nowrap">{tested ? `Tested ${timeAgo(tested)}` : 'Not tested'}</span>
						)}
					</span>
				)}
				{saved ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton size="xs" label={`${provider.name} actions`} disabled={testing}>
								{testing ? (
									<RefreshCw className="animate-spin" aria-hidden="true" />
								) : (
									<MoreHorizontal aria-hidden="true" />
								)}
							</IconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							{canTest && (
								<DropdownMenuItem onSelect={() => void test()}>
									<Plug aria-hidden="true" /> Test connection
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onSelect={() => dispatch({ type: 'dialog', dialog: 'edit' })}>
								<KeyRound aria-hidden="true" /> Replace {noun}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => window.open(provider.consoleUrl, '_blank', 'noreferrer')}>
								<ExternalLink aria-hidden="true" /> Open {provider.name} console
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem tone="danger" onSelect={() => dispatch({ type: 'dialog', dialog: 'remove' })}>
								<Trash2 aria-hidden="true" /> Remove {noun}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Button
						size="sm"
						aria-label={`Add ${provider.name} key`}
						onClick={() => dispatch({ type: 'dialog', dialog: 'edit' })}
					>
						Add key
					</Button>
				)}
			</div>

			{state.test.kind === 'failed' && (
				<div className="px-3 pb-2.5">
					<ErrorNotice
						error={state.test.error}
						onAction={(kind) => {
							if (kind === 'retry') void test();
							else if (kind === 'open-ai-settings') dispatch({ type: 'dialog', dialog: 'edit' });
						}}
						onDismiss={() => dispatch({ type: 'test', test: { kind: 'idle' } })}
					/>
				</div>
			)}

			{/* Mounted only while open, so every open starts from the saved credential's method and an empty field. */}
			{state.dialog === 'edit' && (
				<KeyDialog
					provider={provider}
					saved={saved}
					open
					onOpenChange={(open) => dispatch({ type: 'dialog', dialog: open ? 'edit' : 'none' })}
					onSaved={() => dispatch({ type: 'saved' })}
				/>
			)}
			<ConfirmDialog
				open={state.dialog === 'remove'}
				onOpenChange={(open) => dispatch({ type: 'dialog', dialog: open ? 'remove' : 'none' })}
				title={`Remove the ${provider.name} ${noun}?`}
				description={`Tools that use ${provider.name} stop working until you add a new ${noun}. If sync is on, it is removed from your other devices too.`}
				confirmLabel={`Remove ${noun}`}
				onConfirm={() => void remove()}
			/>
		</li>
	);
}

export function AiSection() {
	const keys = useApiKeys();
	const count = keys ? PROVIDERS.filter((p) => keys[p.id]).length : 0;

	return (
		<section aria-labelledby="ai-title" className="grid gap-5">
			<SettingsHeader
				id="ai-title"
				title="AI providers"
				description="Your Claude subscription or your own API keys, used by tools like the browser agent."
				meta={keys ? `${count} of ${PROVIDERS.length} connected` : undefined}
			/>
			<SettingsGroup title="Providers">
				{keys ? (
					<ul aria-label="Providers" className="divide-y divide-line">
						{PROVIDERS.map((p) => (
							<ProviderRow key={p.id} provider={p} saved={keys[p.id]} />
						))}
					</ul>
				) : (
					<div className="grid gap-2 p-3" aria-busy="true">
						{PROVIDERS.map((p) => (
							<Skeleton key={p.id} className="h-7" />
						))}
					</div>
				)}
			</SettingsGroup>
			<p className="flex items-start gap-1.5 px-0.5 text-sm text-faint">
				<KeyRound size={14} className="mt-px shrink-0" aria-hidden="true" />
				Stored locally and sent only to their own provider. With account sync on, they sync encrypted. Testing sends one
				small request and uses your allowance.
			</p>
		</section>
	);
}
