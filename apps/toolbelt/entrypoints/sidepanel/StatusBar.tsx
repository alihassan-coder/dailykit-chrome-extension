// The 24 px line at the bottom: is my data synced, how many tools are on, and the two keys worth knowing.
import { appError, timeAgo, type AccountState } from '@toolbelt/core';
import { Kbd, KbdGroup, StatusDot, Tooltip } from '@toolbelt/ui';
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

export function StatusBar({ account, toolsOn }: { account: AccountState | null; toolsOn: number }) {
	const now = useMinuteClock();
	const sync = syncNote(account, now);
	return (
		<footer className="@container flex h-6 shrink-0 items-center gap-2 border-t border-line bg-surface px-1.5 text-xs text-faint">
			<Tooltip label={sync.detail} side="top">
				<button
					type="button"
					onClick={() => openDashboard('data')}
					className="flex h-5 min-w-0 items-center gap-1.5 rounded-sm px-1.5 transition-colors duration-100 hover:bg-hover hover:text-ink"
				>
					<StatusDot tone={sync.tone} />
					<span className="tb-num truncate">{sync.text}</span>
				</button>
			</Tooltip>
			<span aria-hidden="true">·</span>
			<span className="tb-num shrink-0 truncate">
				{toolsOn} {toolsOn === 1 ? 'tool' : 'tools'} on
			</span>
			<div className="ml-auto hidden shrink-0 items-center gap-3 pr-1.5 @[320px]:flex">
				<span className="flex items-center gap-1">
					<KbdGroup keys={['Mod', 'K']} />
					Search
				</span>
				<span className="flex items-center gap-1">
					<Kbd>[</Kbd>
					Toolbar
				</span>
			</div>
		</footer>
	);
}
