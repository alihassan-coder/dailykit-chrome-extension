// Data and sync: your account, sync status, and a settings backup you can download and restore.
import { appError, resolveSettings, timeAgo, toAppError, type AccountRequest, type AppError } from '@toolbelt/core';
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
	Input,
	Label,
	StatusDot,
	showError,
	toast,
	useAccount,
	useSettings
} from '@toolbelt/ui';
import {
	Download,
	KeyRound,
	Lock,
	LogOut,
	MoreHorizontal,
	PencilLine,
	RefreshCw,
	Upload,
	UserRound
} from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { tools } from '../../shell/tools.ts';
import { SecretInput, SettingsGroup, SettingsHeader, SettingsRow, useApiKeys } from './shared.tsx';

type Send = ReturnType<typeof useAccount>['send'];

/** Runs an account request; a failure comes back as an AppError (the service's wording is already plain). */
async function run(send: Send, req: AccountRequest, title: string): Promise<AppError | null> {
	try {
		const { error } = await send(req);
		return error ? appError('unknown', {}, { title, message: error, action: undefined }) : null;
	} catch (e) {
		return toAppError(e);
	}
}

function browserName(): string {
	const ua = navigator.userAgent;
	if (/Edg\//.test(ua)) return 'Edge';
	if (/Firefox\//.test(ua)) return 'Firefox';
	if (/Chrome\//.test(ua)) return 'Chrome';
	return 'This browser';
}

const exactTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A small form in a dialog: fields, a submit button and an inline error. */
function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	fields,
	submit,
	onSubmit,
	validate
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	fields: { label: string; secret?: boolean; autoComplete?: string }[];
	submit: string;
	onSubmit: (values: string[]) => Promise<AppError | null>;
	validate?: (values: string[]) => string | null;
}) {
	const id = useId();
	const [values, setValues] = useState(() => fields.map(() => ''));
	const [error, setError] = useState<AppError | null>(null);
	const [busy, setBusy] = useState(false);
	const filled = values.every((v) => v.trim());
	const problem = filled ? (validate?.(values) ?? null) : null;

	async function handle(e: FormEvent) {
		e.preventDefault();
		if (!filled || problem) return;
		setBusy(true);
		setError(null);
		const failure = await onSubmit(values);
		setBusy(false);
		if (failure) setError(failure);
		else onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handle} className="grid gap-3">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>
					{fields.map((f, i) => {
						const props = {
							id: `${id}-${i}`,
							value: values[i],
							autoComplete: f.autoComplete,
							autoFocus: i === 0,
							onChange: (e: { target: { value: string } }) =>
								setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))
						};
						return (
							<div key={f.label} className="grid gap-1.5">
								<Label htmlFor={props.id}>{f.label}</Label>
								{f.secret ? <SecretInput {...props} /> : <Input {...props} />}
							</div>
						);
					})}
					{problem && <p className="text-sm text-warn">{problem}</p>}
					{error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
					<DialogFooter>
						<Button variant="quiet" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={!filled || !!problem} loading={busy}>
							{submit}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AccountRows() {
	const { account, send } = useAccount();
	const [dialog, setDialog] = useState<'rename' | 'password' | 'sign-out' | null>(null);
	const [syncing, setSyncing] = useState(false);
	const close = (open: boolean) => !open && setDialog(null);

	if (!account) {
		return (
			<SettingsGroup title="Account">
				<SettingsRow icon={<UserRound />} label="Checking your account…" />
			</SettingsGroup>
		);
	}
	if (account.state !== 'unlocked' && account.state !== 'locked') {
		return (
			<SettingsGroup title="Account">
				<SettingsRow
					icon={<UserRound />}
					label="No Toolbelt account on this device"
					hint="Settings and data stay in this browser only. Open the side panel to set up an account and sync."
				/>
			</SettingsGroup>
		);
	}

	async function syncNow() {
		setSyncing(true);
		const failure = await run(send, { type: 'sync:now' }, 'Sync did not finish');
		setSyncing(false);
		if (failure) showError(failure);
		else toast.success('Synced');
	}

	async function act(req: AccountRequest, title: string, done: string) {
		const failure = await run(send, req, title);
		if (failure) showError(failure);
		else toast.success(done);
	}

	const unlocked = account.state === 'unlocked';

	return (
		<>
			<SettingsGroup title="Account">
				<SettingsRow
					icon={<UserRound />}
					label={
						<span className="flex items-center gap-2">
							<span className="truncate">{account.username}</span>
							<Badge tone={unlocked ? 'ok' : 'neutral'}>{unlocked ? 'Unlocked' : 'Locked'}</Badge>
						</span>
					}
					hint={`${browserName()} on this computer`}
				>
					{unlocked && (
						<Button
							size="sm"
							icon={<Lock aria-hidden="true" />}
							onClick={() => void act({ type: 'account:lock' }, 'Could not lock', 'Toolbelt locked')}
						>
							Lock now
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton size="xs" label="Account actions">
								<MoreHorizontal aria-hidden="true" />
							</IconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem disabled={!unlocked} onSelect={() => setDialog('rename')}>
								<PencilLine aria-hidden="true" /> Change username
							</DropdownMenuItem>
							<DropdownMenuItem disabled={!unlocked} onSelect={() => setDialog('password')}>
								<KeyRound aria-hidden="true" /> Change master password
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem tone="danger" onSelect={() => setDialog('sign-out')}>
								<LogOut aria-hidden="true" /> Sign out of this device
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SettingsRow>
			</SettingsGroup>

			{unlocked && (
				<SettingsGroup title="Sync">
					<SettingsRow
						icon={<StatusDot tone={account.syncError ? 'warn' : account.lastSync ? 'ok' : 'idle'} className="mx-1" />}
						label={
							account.syncError ? (
								'Sync paused'
							) : (
								<span title={account.lastSync ? exactTime(account.lastSync) : undefined}>
									Synced {timeAgo(account.lastSync)}
									{account.lastSync && (
										<span className="ml-2 text-sm font-normal text-faint tb-num">{exactTime(account.lastSync)}</span>
									)}
								</span>
							)
						}
						hint="Settings, API keys and tool data sync encrypted to your own Neon database and your other devices."
					>
						<Button size="sm" icon={<RefreshCw aria-hidden="true" />} loading={syncing} onClick={() => void syncNow()}>
							Sync now
						</Button>
					</SettingsRow>
					{account.syncError && (
						<div className="px-3 py-2.5">
							<ErrorNotice error={appError('sync_failed')} onAction={(kind) => kind === 'retry' && void syncNow()} />
						</div>
					)}
				</SettingsGroup>
			)}

			{dialog === 'rename' && (
				<FormDialog
					open
					onOpenChange={close}
					title="Change username"
					description="You sign in with this name on your other devices."
					fields={[{ label: 'New username', autoComplete: 'username' }]}
					submit="Change username"
					onSubmit={async ([username]) => {
						const failure = await run(
							send,
							{ type: 'account:rename', username: username!.trim() },
							'Could not change the username'
						);
						if (!failure) toast.success('Username changed');
						return failure;
					}}
				/>
			)}
			{dialog === 'password' && (
				<FormDialog
					open
					onOpenChange={close}
					title="Change master password"
					description="Your data is re-encrypted with the new password. Other devices ask for it next time they unlock."
					fields={[
						{ label: 'Current master password', secret: true, autoComplete: 'current-password' },
						{ label: 'New master password', secret: true, autoComplete: 'new-password' },
						{ label: 'Repeat new password', secret: true, autoComplete: 'new-password' }
					]}
					validate={([, next, repeat]) => (next !== repeat ? 'The new passwords do not match.' : null)}
					submit="Change password"
					onSubmit={async ([currentPassword, newPassword]) => {
						const failure = await run(
							send,
							{ type: 'account:change-password', currentPassword: currentPassword!, newPassword: newPassword! },
							'Could not change the password'
						);
						if (!failure) toast.success('Master password changed');
						return failure;
					}}
				/>
			)}
			<ConfirmDialog
				open={dialog === 'sign-out'}
				onOpenChange={close}
				title="Sign out of this device?"
				description="Synced data is removed from this browser. It stays in your database and on your other devices; sign in again to get it back."
				confirmLabel="Sign out"
				onConfirm={() => void act({ type: 'account:forget-device' }, 'Could not sign out', 'Signed out of this device')}
			/>
		</>
	);
}

export function DataSection() {
	const { settings, update } = useSettings();
	const keys = useApiKeys();
	const fileInput = useRef<HTMLInputElement>(null);
	const toolCount = Object.keys(settings.tools).length;
	const keyCount = keys ? Object.values(keys).filter(Boolean).length : 0;

	function exportSettings() {
		const blob = new Blob([JSON.stringify({ app: 'toolbelt', settings }, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `toolbelt-settings-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
		toast.success('Settings downloaded');
	}

	async function importSettings(file: File) {
		let parsed: { app?: string; settings?: unknown };
		try {
			parsed = JSON.parse(await file.text()) as typeof parsed;
		} catch {
			parsed = {};
		}
		if (parsed.app !== 'toolbelt') {
			showError(
				appError(
					'unknown',
					{},
					{
						title: 'Not a Toolbelt backup',
						message: 'That file is not a Toolbelt settings backup. Nothing was changed.',
						severity: 'warn',
						action: undefined
					}
				)
			);
			return;
		}
		try {
			await update(() => resolveSettings(parsed.settings, tools));
			toast.success('Settings restored');
		} catch (e) {
			showError(e);
		}
	}

	return (
		<section aria-labelledby="data-title" className="grid gap-5">
			<SettingsHeader
				id="data-title"
				title="Data and sync"
				description="Your account, and your data in your own Neon database, encrypted with your master password."
			/>

			<AccountRows />

			<SettingsGroup
				title="Backup"
				meta={`${toolCount} tools · ${keyCount} ${keyCount === 1 ? 'key' : 'keys'} on this device`}
			>
				<SettingsRow
					icon={<Download />}
					label="Download settings"
					hint="Tools, order, look and start options as a JSON file. API keys and tool data are not included."
				>
					<Button size="sm" onClick={exportSettings}>
						Download
					</Button>
				</SettingsRow>
				<SettingsRow icon={<Upload />} label="Restore settings" hint="Replace these settings with a downloaded backup.">
					<Button size="sm" onClick={() => fileInput.current?.click()}>
						Choose file…
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
				</SettingsRow>
			</SettingsGroup>
		</section>
	);
}
