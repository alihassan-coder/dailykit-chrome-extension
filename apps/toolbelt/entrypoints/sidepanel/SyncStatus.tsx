// The sync state in the dock bar: is my data synced, and when.
import { appError, timeAgo, type AccountState } from '@toolbelt/core';
import { StatusDot, Tooltip, cn } from '@toolbelt/ui';
import { useEffect, useState } from 'react';
import { openDashboard } from '../../shell/commands.ts';

const MINUTE = 60_000;

/** The current time, ticking once a minute, so "2 min ago" stays true. */
function useMinuteClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), MINUTE);
		return () => clearInterval(id);
	}, []);
	return now;
}

type SyncNote = { tone: 'ok' | 'warn' | 'idle'; text: string; detail: string };

function syncNote(account: AccountState | null, now: number): SyncNote {
	if (account?.state !== 'unlocked')
		return { tone: 'idle', text: 'Locked', detail: 'Unlock Toolbelt to sync your data.' };
	// The background's sync error is for logs; the screen gets the plain wording.
	if (account.syncError) {
		const e = appError('sync_failed');
		return { tone: 'warn', text: e.title, detail: e.message };
	}
	if (!account.lastSync) return { tone: 'idle', text: 'Not synced yet', detail: 'Your data syncs in the background.' };
	return { tone: 'ok', text: `Synced ${timeAgo(account.lastSync, now)}`, detail: 'Your data is encrypted and synced.' };
}

/** Is my data synced: a dot and a short label (hidden on very narrow panels); the full sentence is in the tooltip. */
export function SyncStatus({ account, className }: { account: AccountState | null; className?: string }) {
	const now = useMinuteClock();
	const sync = syncNote(account, now);
	return (
		<Tooltip label={`${sync.text}. ${sync.detail}`} side="top">
			<button
				type="button"
				aria-label={`${sync.text}. ${sync.detail}`}
				onClick={() => openDashboard('data')}
				className={cn(
					'flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-faint transition-colors duration-100 hover:bg-hover hover:text-ink',
					className
				)}
			>
				<StatusDot tone={sync.tone} />
				<span className="tb-num hidden min-w-0 truncate @[300px]:inline">{sync.text}</span>
			</button>
		</Tooltip>
	);
}
