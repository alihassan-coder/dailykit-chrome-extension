// Everything before Toolbelt opens: connect a database (only if the build has none), create an account or
// sign in, save the recovery key once, and unlock with the master password after the browser restarts.
// One compact 360 px card per step; errors are a Notice in plain words.
import { checkDatabaseUrl, toAppError, type AccountState, type AppError } from '@toolbelt/core';
import {
	Button,
	ErrorNotice,
	IconButton,
	Input,
	Label,
	Logo,
	Notice,
	Skeleton,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	cn,
	useAccount
} from '@toolbelt/ui';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

const MIN_PASSWORD = 10;

type Send = ReturnType<typeof useAccount>['send'];

/**
 * The account service answers in sentences written for people, but a database driver can still leak a raw
 * message through it. Anything that does not read like a short sentence is replaced with `fallback`.
 */
function plainWords(text: string | null | undefined, fallback: string): string {
	if (!text) return fallback;
	const t = text.trim();
	const looksRaw =
		t.length > 180 ||
		!/^[A-Z“"]/.test(t) ||
		// "fetch failed: …", "ECONNREFUSED", stack frames, JSON, a link with its password in it.
		/^[a-z_]+:|\bE[A-Z]{4,}\b/.test(t) ||
		/error:|exception|\bat\s+\S+\s*\(|[{}[\]<>]|:\/\/\S*@/i.test(t);
	return looksRaw ? fallback : t;
}

function Screen({ title, body, children }: { title: string; body?: ReactNode; children: ReactNode }) {
	return (
		<div className="grid min-h-dvh place-items-center bg-bg px-4 py-8 text-ink">
			<div className="tb-enter grid w-full max-w-[360px] gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
				<div className="grid justify-items-start gap-2.5">
					<Logo size={24} />
					<div className="grid gap-1">
						<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
						{body && <p className="text-sm text-muted">{body}</p>}
					</div>
				</div>
				{children}
			</div>
		</div>
	);
}

function Field({
	label,
	type = 'text',
	value,
	onChange,
	autoComplete,
	hint,
	autoFocus
}: {
	label: string;
	type?: 'text' | 'password';
	value: string;
	onChange: (v: string) => void;
	autoComplete?: string;
	hint?: string;
	autoFocus?: boolean;
}) {
	const id = useId();
	const [show, setShow] = useState(false);
	const secret = type === 'password';
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					id={id}
					type={secret && !show ? 'password' : 'text'}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					autoComplete={autoComplete}
					autoFocus={autoFocus}
					spellCheck={false}
					aria-describedby={hint ? `${id}-hint` : undefined}
					className={cn(secret && 'pr-9')}
				/>
				{secret && (
					<IconButton
						size="xs"
						side="top"
						label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
						aria-pressed={show}
						onClick={() => setShow((s) => !s)}
						className="absolute top-1/2 right-1 -translate-y-1/2"
					>
						{show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
					</IconButton>
				)}
			</div>
			{hint && (
				<p id={`${id}-hint`} className="text-xs text-faint">
					{hint}
				</p>
			)}
		</div>
	);
}

/** A problem to show under a form: our own sentence, or anything thrown, mapped to plain words. */
type Problem = { text: string } | { error: AppError };

function ProblemNotice({ problem }: { problem: Problem }) {
	if ('error' in problem) return <ErrorNotice error={problem.error} />;
	return <Notice tone="danger">{problem.text}</Notice>;
}

const toProblem = (text: string | null | undefined, fallback: string): Problem | null =>
	text ? { text: plainWords(text, fallback) } : null;

const GENERIC = 'Toolbelt could not finish that. Try again.';

function Form({
	onSubmit,
	submit,
	busyLabel,
	children,
	error
}: {
	/** Returns a problem to show, or null when it worked. */
	onSubmit: () => Promise<string | null>;
	submit: string;
	busyLabel: string;
	children: ReactNode;
	error?: string | null;
}) {
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<Problem | null>(null);
	async function handle(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setProblem(null);
		try {
			setProblem(toProblem(await onSubmit(), GENERIC));
		} catch (err) {
			setProblem({ error: toAppError(err) });
		} finally {
			setBusy(false);
		}
	}
	const shown = problem ?? toProblem(error, GENERIC);
	return (
		<form onSubmit={handle} className="grid gap-3" noValidate>
			{children}
			{shown && <ProblemNotice problem={shown} />}
			<Button type="submit" variant="primary" loading={busy} className="mt-1 w-full">
				{busy ? busyLabel : submit}
			</Button>
		</form>
	);
}

/** A button that sends one request and shows a spinner meanwhile; failures go to `onProblem`. */
function useAction(onProblem: (p: Problem | null) => void) {
	const [busy, setBusy] = useState(false);
	async function run(action: () => Promise<{ error: string | null }>) {
		setBusy(true);
		onProblem(null);
		try {
			onProblem(toProblem((await action()).error, GENERIC));
		} catch (err) {
			onProblem({ error: toAppError(err) });
		} finally {
			setBusy(false);
		}
	}
	return { busy, run };
}

function ConnectDatabase({ send, error }: { send: Send; error?: string }) {
	const [url, setUrl] = useState('');
	return (
		<Screen
			title="Connect your database"
			body="Toolbelt keeps your data in your own Neon database, encrypted. Paste its connection string: Neon, your project, Connect."
		>
			<Form
				submit="Connect"
				busyLabel="Connecting…"
				error={error}
				onSubmit={async () => checkDatabaseUrl(url) ?? (await send({ type: 'account:set-database', url })).error}
			>
				<Field label="Connection string" type="password" value={url} onChange={setUrl} autoFocus />
			</Form>
		</Screen>
	);
}

function Welcome({ send, onCreated }: { send: Send; onCreated: (key: string) => void }) {
	const [mode, setMode] = useState<'create' | 'sign-in'>('create');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	// Focus the first field on arrival only; after a tab switch, focus stays on the tabs.
	const [switched, setSwitched] = useState(false);

	return (
		<Screen
			title={mode === 'create' ? 'Create your Toolbelt account' : 'Sign in'}
			body={
				mode === 'create'
					? 'One account for all your devices. Your master password encrypts everything; it is never stored or sent.'
					: 'Use the username and master password from your other device.'
			}
		>
			<Tabs
				value={mode}
				onValueChange={(v) => {
					setMode(v as 'create' | 'sign-in');
					setSwitched(true);
				}}
				className="grid gap-4"
			>
				<TabsList aria-label="Account">
					<TabsTrigger value="create">Create account</TabsTrigger>
					<TabsTrigger value="sign-in">Sign in</TabsTrigger>
				</TabsList>
				<TabsContent value="create">
					<Form
						submit="Create account"
						busyLabel="Creating your account…"
						onSubmit={async () => {
							if (password.length < MIN_PASSWORD)
								return `Use at least ${MIN_PASSWORD} characters for the master password.`;
							if (password !== confirm) return 'The two passwords are different.';
							const res = await send({ type: 'account:create', username, password });
							if (res.recoveryKey) onCreated(res.recoveryKey);
							return res.error;
						}}
					>
						<Field
							label="Username"
							value={username}
							onChange={setUsername}
							autoComplete="username"
							autoFocus={!switched}
						/>
						<Field
							label="Master password"
							type="password"
							value={password}
							onChange={setPassword}
							autoComplete="new-password"
							hint={`At least ${MIN_PASSWORD} characters. A short sentence is easy to remember and hard to guess.`}
						/>
						<Field
							label="Master password again"
							type="password"
							value={confirm}
							onChange={setConfirm}
							autoComplete="new-password"
						/>
					</Form>
				</TabsContent>
				<TabsContent value="sign-in">
					<Form
						submit="Sign in"
						busyLabel="Signing in…"
						onSubmit={async () => (await send({ type: 'account:sign-in', username, password })).error}
					>
						<Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
						<Field
							label="Master password"
							type="password"
							value={password}
							onChange={setPassword}
							autoComplete="current-password"
						/>
					</Form>
				</TabsContent>
			</Tabs>
		</Screen>
	);
}

function SaveRecoveryKey({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const [typed, setTyped] = useState('');
	const lastGroup = recoveryKey.split('-').at(-1) ?? '';
	const confirmed = typed.trim().toUpperCase() === lastGroup;

	async function copy() {
		try {
			await navigator.clipboard.writeText(recoveryKey);
			setCopied(true);
			setCopyFailed(false);
		} catch {
			setCopyFailed(true);
		}
	}

	return (
		<Screen
			title="Save your recovery key"
			body="If you forget your master password, this key is the only way back in. Nobody else has a copy, not even Toolbelt."
		>
			<div className="grid gap-2 rounded-lg border border-line bg-soft p-3">
				<code className="font-mono text-base leading-relaxed tracking-wide break-all select-all">{recoveryKey}</code>
				<Button
					size="sm"
					icon={copied ? <Check className="text-ok" aria-hidden="true" /> : <Copy aria-hidden="true" />}
					onClick={() => void copy()}
					className="justify-self-start"
				>
					{copied ? 'Copied' : 'Copy recovery key'}
				</Button>
			</div>
			{copyFailed && (
				<Notice tone="warn" title="Couldn’t copy">
					Select the key above and copy it by hand.
				</Notice>
			)}
			<p className="text-sm text-muted">
				Write it down or keep it in your password manager. It will not be shown again.
			</p>
			<Field
				label="Type the last four characters of the key to confirm you saved it"
				value={typed}
				onChange={setTyped}
			/>
			<Button variant="primary" disabled={!confirmed} onClick={onDone} className="w-full">
				I saved it, open Toolbelt
			</Button>
		</Screen>
	);
}

function Unlock({ username, send }: { username: string; send: Send }) {
	const [mode, setMode] = useState<'unlock' | 'recover'>('unlock');
	const [password, setPassword] = useState('');
	const [recoveryKey, setRecoveryKey] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [problem, setProblem] = useState<Problem | null>(null);
	const forget = useAction(setProblem);

	if (mode === 'recover') {
		return (
			<Screen
				title="Reset your master password"
				body="Your recovery key opens your account; then choose a new master password."
			>
				<Form
					submit="Reset password and unlock"
					busyLabel="Unlocking…"
					onSubmit={async () => {
						if (newPassword.length < MIN_PASSWORD)
							return `Use at least ${MIN_PASSWORD} characters for the new password.`;
						return (await send({ type: 'account:recover', username, recoveryKey, newPassword })).error;
					}}
				>
					<Field label="Recovery key" value={recoveryKey} onChange={setRecoveryKey} autoFocus />
					<Field
						label="New master password"
						type="password"
						value={newPassword}
						onChange={setNewPassword}
						autoComplete="new-password"
					/>
				</Form>
				<Button variant="quiet" size="sm" onClick={() => setMode('unlock')} className="justify-self-start">
					Back to unlock
				</Button>
			</Screen>
		);
	}

	return (
		<Screen
			title={`Welcome back, ${username}`}
			body="Toolbelt locks when the browser closes. Enter your master password to open it."
		>
			<Form
				submit="Unlock"
				busyLabel="Unlocking…"
				onSubmit={async () => (await send({ type: 'account:unlock', password })).error}
			>
				<Field
					label="Master password"
					type="password"
					value={password}
					onChange={setPassword}
					autoComplete="current-password"
					autoFocus
				/>
			</Form>
			{problem && <ProblemNotice problem={problem} />}
			<div className="flex flex-wrap justify-between gap-2">
				<Button variant="quiet" size="sm" onClick={() => setMode('recover')}>
					Forgot your password?
				</Button>
				<Button
					variant="quiet"
					size="sm"
					loading={forget.busy}
					onClick={() => void forget.run(() => send({ type: 'account:forget-device' }))}
				>
					Use another account
				</Button>
			</div>
		</Screen>
	);
}

const DATABASE_FALLBACK = 'The database could not be reached. Check your connection, then try again.';

function DatabaseError({ message, send }: { message: string; send: Send }) {
	const [changing, setChanging] = useState(false);
	const [problem, setProblem] = useState<Problem | null>(null);
	const retry = useAction(setProblem);
	if (changing) return <ConnectDatabase send={send} />;
	return (
		<Screen title="Toolbelt cannot reach your database">
			<Notice tone="danger">{plainWords(message, DATABASE_FALLBACK)}</Notice>
			{problem && <ProblemNotice problem={problem} />}
			<div className="flex gap-2">
				<Button
					variant="primary"
					loading={retry.busy}
					onClick={() => void retry.run(() => send({ type: 'account:status' }))}
				>
					Try again
				</Button>
				<Button onClick={() => setChanging(true)}>Use a different link</Button>
			</div>
		</Screen>
	);
}

/** While the background answers: the card's outline, so the screen never flashes blank. */
function GateSkeleton() {
	return (
		<div className="grid min-h-dvh place-items-center bg-bg px-4 py-8" role="status" aria-label="Loading Toolbelt">
			<div className="grid w-full max-w-[360px] gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
				<Skeleton className="size-6" />
				<div className="grid gap-2">
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="h-3.5 w-full" />
				</div>
				<Skeleton className="h-8" />
				<Skeleton className="h-8" />
			</div>
		</div>
	);
}

function screenFor(account: AccountState, send: Send, onCreated: (key: string) => void, children: ReactNode) {
	switch (account.state) {
		case 'no-database':
			return <ConnectDatabase send={send} />;
		case 'database-error':
			return <DatabaseError message={account.message} send={send} />;
		case 'no-account':
			return <Welcome send={send} onCreated={onCreated} />;
		case 'locked':
			return <Unlock username={account.username} send={send} />;
		case 'unlocked':
			return children;
	}
}

export function AccountGate({ children }: { children: ReactNode }) {
	const { account, send } = useAccount();
	const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

	if (recoveryKey) return <SaveRecoveryKey recoveryKey={recoveryKey} onDone={() => setRecoveryKey(null)} />;
	if (!account) return <GateSkeleton />;
	return <>{screenFor(account, send, setRecoveryKey, children)}</>;
}
