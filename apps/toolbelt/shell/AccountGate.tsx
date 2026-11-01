// Everything before Toolbelt opens: connect a database (only if the build has none), create an account or
// sign in, save the recovery key once, and unlock with the master password after the browser restarts.
import { checkDatabaseUrl, type AccountState } from '@toolbelt/core';
import { Button, Logo, Segmented, useAccount } from '@toolbelt/ui';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

const MIN_PASSWORD = 10;

function Screen({ title, body, children }: { title: string; body?: ReactNode; children: ReactNode }) {
	return (
		<div className="grid min-h-screen place-items-center bg-bg px-5 py-10 text-ink">
			<div className="grid w-full max-w-[380px] gap-6">
				<div className="grid justify-items-start gap-3">
					<Logo size={28} />
					<div>
						<h1 className="text-xl font-semibold">{title}</h1>
						{body && <p className="mt-1 text-sm text-muted">{body}</p>}
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
	const [show, setShow] = useState(false);
	const secret = type === 'password';
	return (
		<label className="grid gap-1.5">
			<span className="text-sm font-medium">{label}</span>
			<span className="relative">
				<input
					type={secret && !show ? 'password' : 'text'}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					autoComplete={autoComplete}
					autoFocus={autoFocus}
					spellCheck={false}
					className={`h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-accent ${secret ? 'pr-10' : ''}`}
				/>
				{secret && (
					<button
						type="button"
						onClick={() => setShow((s) => !s)}
						aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
						className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-ink"
					>
						{show ? <EyeOff size={16} /> : <Eye size={16} />}
					</button>
				)}
			</span>
			{hint && <span className="text-xs text-muted">{hint}</span>}
		</label>
	);
}

function Form({
	onSubmit,
	submit,
	busyLabel,
	children,
	error
}: {
	onSubmit: () => Promise<string | null>;
	submit: string;
	busyLabel: string;
	children: ReactNode;
	error?: string | null;
}) {
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	async function handle(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setProblem(null);
		setProblem(await onSubmit());
		setBusy(false);
	}
	const shown = problem ?? error;
	return (
		<form onSubmit={handle} className="grid gap-4">
			{children}
			{shown && (
				<p role="alert" className="text-sm text-danger">
					{shown}
				</p>
			)}
			<Button type="submit" variant="primary" disabled={busy} className="justify-center">
				{busy ? busyLabel : submit}
			</Button>
		</form>
	);
}

function ConnectDatabase({ send, error }: { send: ReturnType<typeof useAccount>['send']; error?: string }) {
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

function Welcome({
	send,
	onCreated
}: {
	send: ReturnType<typeof useAccount>['send'];
	onCreated: (key: string) => void;
}) {
	const [mode, setMode] = useState<'create' | 'sign-in'>('create');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');

	return (
		<Screen
			title={mode === 'create' ? 'Create your Toolbelt account' : 'Sign in'}
			body={
				mode === 'create'
					? 'One account for all your devices. Your master password encrypts everything; it is never stored or sent.'
					: 'Use the username and master password from your other device.'
			}
		>
			<Segmented<'create' | 'sign-in'>
				label="Account"
				value={mode}
				onChange={setMode}
				options={[
					{ value: 'create', label: 'Create account' },
					{ value: 'sign-in', label: 'Sign in' }
				]}
			/>
			{mode === 'create' ? (
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
					<Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
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
			) : (
				<Form
					submit="Sign in"
					busyLabel="Signing in…"
					onSubmit={async () => (await send({ type: 'account:sign-in', username, password })).error}
				>
					<Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
					<Field
						label="Master password"
						type="password"
						value={password}
						onChange={setPassword}
						autoComplete="current-password"
					/>
				</Form>
			)}
		</Screen>
	);
}

function SaveRecoveryKey({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
	const [copied, setCopied] = useState(false);
	const [typed, setTyped] = useState('');
	const lastGroup = recoveryKey.split('-').at(-1) ?? '';
	const confirmed = typed.trim().toUpperCase() === lastGroup;

	return (
		<Screen
			title="Save your recovery key"
			body="If you forget your master password, this key is the only way back in. Nobody else has a copy, not even Toolbelt."
		>
			<div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
				<code className="font-mono text-base leading-relaxed tracking-wide break-all">{recoveryKey}</code>
				<Button
					icon={copied ? <Check size={16} className="text-ok" /> : <Copy size={16} />}
					onClick={async () => {
						await navigator.clipboard.writeText(recoveryKey);
						setCopied(true);
					}}
				>
					{copied ? 'Copied' : 'Copy recovery key'}
				</Button>
			</div>
			<p className="text-sm text-muted">
				Write it down or keep it in your password manager. It will not be shown again.
			</p>
			<Field
				label="Type the last four characters of the key to confirm you saved it"
				value={typed}
				onChange={setTyped}
			/>
			<Button variant="primary" disabled={!confirmed} onClick={onDone} className="justify-center">
				I saved it, open Toolbelt
			</Button>
		</Screen>
	);
}

function Unlock({ username, send }: { username: string; send: ReturnType<typeof useAccount>['send'] }) {
	const [mode, setMode] = useState<'unlock' | 'recover'>('unlock');
	const [password, setPassword] = useState('');
	const [recoveryKey, setRecoveryKey] = useState('');
	const [newPassword, setNewPassword] = useState('');

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
				<Button variant="quiet" onClick={() => setMode('unlock')} className="justify-self-start">
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
			<div className="flex flex-wrap justify-between gap-2">
				<Button variant="quiet" onClick={() => setMode('recover')}>
					Forgot your password?
				</Button>
				<Button variant="quiet" onClick={() => void send({ type: 'account:forget-device' })}>
					Use another account
				</Button>
			</div>
		</Screen>
	);
}

function DatabaseError({ message, send }: { message: string; send: ReturnType<typeof useAccount>['send'] }) {
	const [changing, setChanging] = useState(false);
	if (changing) return <ConnectDatabase send={send} />;
	return (
		<Screen title="Toolbelt cannot reach your database" body={message}>
			<div className="flex gap-2">
				<Button variant="primary" onClick={() => void send({ type: 'account:status' })}>
					Try again
				</Button>
				<Button onClick={() => setChanging(true)}>Use a different link</Button>
			</div>
		</Screen>
	);
}

export function AccountGate({ children }: { children: ReactNode }) {
	const { account, send } = useAccount();
	const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

	if (recoveryKey) return <SaveRecoveryKey recoveryKey={recoveryKey} onDone={() => setRecoveryKey(null)} />;
	if (!account) return <div className="min-h-screen bg-bg" />;

	const screens: Record<AccountState['state'], () => ReactNode> = {
		'no-database': () => <ConnectDatabase send={send} />,
		'database-error': () => <DatabaseError message={(account as { message: string }).message} send={send} />,
		'no-account': () => <Welcome send={send} onCreated={setRecoveryKey} />,
		locked: () => <Unlock username={(account as { username: string }).username} send={send} />,
		unlocked: () => children
	};
	return <>{screens[account.state]()}</>;
}
