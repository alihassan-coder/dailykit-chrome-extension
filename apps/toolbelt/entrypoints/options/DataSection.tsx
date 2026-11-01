// Data and sync: your account, sync status, and a settings backup you can download and restore.
import { resolveSettings, timeAgo } from '@toolbelt/core';
import { Button, useAccount, useSettings } from '@toolbelt/ui';
import { Cloud, CloudAlert, Download, Lock, RefreshCw, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { tools } from '../../shell/tools.ts';

function Card({ children }: { children: ReactNode }) {
	return <div className="grid gap-3 rounded-lg border border-line bg-surface p-5">{children}</div>;
}

function InlineForm({
	fields,
	submit,
	onSubmit,
	onCancel
}: {
	fields: { label: string; type?: string; autoComplete?: string }[];
	submit: string;
	onSubmit: (values: string[]) => Promise<string | null>;
	onCancel: () => void;
}) {
	const [values, setValues] = useState(fields.map(() => ''));
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	async function handle(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		const problem = await onSubmit(values);
		setBusy(false);
		if (problem) setError(problem);
		else onCancel();
	}
	return (
		<form onSubmit={handle} className="grid gap-3 rounded-md border border-line bg-bg p-4">
			{fields.map((f, i) => (
				<label key={f.label} className="grid gap-1.5 text-sm">
					<span className="font-medium">{f.label}</span>
					<input
						type={f.type ?? 'text'}
						autoComplete={f.autoComplete}
						value={values[i]}
						onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
						className="h-9 rounded-md border border-line bg-surface px-3 outline-none focus:border-accent"
					/>
				</label>
			))}
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<Button type="submit" variant="primary" disabled={busy}>
					{busy ? 'Saving…' : submit}
				</Button>
				<Button variant="quiet" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function AccountCard() {
	const { account, send } = useAccount();
	const [editing, setEditing] = useState<'rename' | 'password' | null>(null);
	if (account?.state !== 'unlocked') return null;

	return (
		<Card>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm text-muted">Signed in as</p>
					<p className="text-lg font-semibold">{account.username}</p>
				</div>
				<Button icon={<Lock size={16} />} onClick={() => void send({ type: 'account:lock' })}>
					Lock now
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button variant="quiet" onClick={() => setEditing('rename')}>
					Change username
				</Button>
				<Button variant="quiet" onClick={() => setEditing('password')}>
					Change master password
				</Button>
				<Button variant="quiet" onClick={() => void send({ type: 'account:forget-device' })}>
					Sign out of this device
				</Button>
			</div>
			{editing === 'rename' && (
				<InlineForm
					fields={[{ label: 'New username', autoComplete: 'username' }]}
					submit="Change username"
					onCancel={() => setEditing(null)}
					onSubmit={async ([username]) => (await send({ type: 'account:rename', username: username! })).error}
				/>
			)}
			{editing === 'password' && (
				<InlineForm
					fields={[
						{ label: 'Current master password', type: 'password', autoComplete: 'current-password' },
						{ label: 'New master password', type: 'password', autoComplete: 'new-password' }
					]}
					submit="Change master password"
					onCancel={() => setEditing(null)}
					onSubmit={async ([currentPassword, newPassword]) =>
						(
							await send({
								type: 'account:change-password',
								currentPassword: currentPassword!,
								newPassword: newPassword!
							})
						).error
					}
				/>
			)}
		</Card>
	);
}

function SyncCard() {
	const { account, send } = useAccount();
	const [busy, setBusy] = useState(false);
	if (account?.state !== 'unlocked') return null;
	const paused = account.syncError;

	return (
		<Card>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-start gap-3">
					{paused ? (
						<CloudAlert size={20} className="mt-0.5 text-warn" />
					) : (
						<Cloud size={20} className="mt-0.5 text-ok" />
					)}
					<div>
						<p className="font-medium">{paused ? 'Sync paused' : `Synced ${timeAgo(account.lastSync)}`}</p>
						<p className="text-sm text-muted">
							{paused ??
								'Settings, API keys and tool data sync encrypted to your Neon database and your other devices.'}
						</p>
					</div>
				</div>
				<Button
					icon={<RefreshCw size={16} className={busy ? 'animate-spin' : ''} />}
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						await send({ type: 'sync:now' });
						setBusy(false);
					}}
				>
					Sync now
				</Button>
			</div>
		</Card>
	);
}

export function DataSection() {
	const { settings, update } = useSettings();
	const fileInput = useRef<HTMLInputElement>(null);
	const [message, setMessage] = useState<string | null>(null);

	function exportSettings() {
		const blob = new Blob([JSON.stringify({ app: 'toolbelt', settings }, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `toolbelt-settings-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
		setMessage('Settings downloaded.');
	}

	async function importSettings(file: File) {
		try {
			const parsed = JSON.parse(await file.text()) as { app?: string; settings?: unknown };
			if (parsed.app !== 'toolbelt') throw new Error('not a Toolbelt file');
			await update(() => resolveSettings(parsed.settings, tools));
			setMessage('Settings restored.');
		} catch {
			setMessage('That file is not a Toolbelt settings backup. Nothing was changed.');
		}
	}

	return (
		<section aria-labelledby="data-title" className="grid gap-4">
			<div>
				<h2 id="data-title" className="text-xl font-semibold">
					Data and sync
				</h2>
				<p className="text-sm text-muted">
					Your account, and your data in your own Neon database, encrypted with your master password.
				</p>
			</div>

			<AccountCard />
			<SyncCard />

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-4">
				<Button icon={<Download size={16} />} onClick={exportSettings}>
					Download settings
				</Button>
				<Button icon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>
					Restore settings
				</Button>
				<input
					ref={fileInput}
					type="file"
					accept="application/json"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) void importSettings(file);
						e.target.value = '';
					}}
				/>
				{message && (
					<p role="status" className="text-sm text-muted">
						{message}
					</p>
				)}
			</div>
		</section>
	);
}
