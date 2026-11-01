// Black-and-white controls in the side panel: on/off, strength, and keeping the current site in colour.
import { toolValue } from '@toolbelt/core';
import { EmptyState, IconButton, Switch, localArea } from '@toolbelt/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
	DEFAULT_STATE,
	STATE_KEY,
	appliesTo,
	hostOf,
	resolveState,
	toggleSkip,
	type GrayscaleState
} from './grayscale.ts';

const store = toolValue(localArea, 'grayscale', STATE_KEY, resolveState);

/** The site in the active tab of this side panel's window, kept up to date as the user switches tabs or navigates. */
function useCurrentSite() {
	const [host, setHost] = useState<string | null>(null);
	useEffect(() => {
		const read = () =>
			browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setHost(hostOf(tab?.url)));
		void read();
		const onUpdated = (_id: number, change: { url?: string }) => change.url && void read();
		browser.tabs.onActivated.addListener(read);
		browser.tabs.onUpdated.addListener(onUpdated);
		return () => {
			browser.tabs.onActivated.removeListener(read);
			browser.tabs.onUpdated.removeListener(onUpdated);
		};
	}, []);
	return host;
}

export default function GrayscalePanel() {
	const [state, setState] = useState<GrayscaleState>(DEFAULT_STATE);
	const host = useCurrentSite();

	useEffect(() => {
		void store.get().then(setState);
		return store.subscribe(setState);
	}, []);

	const change = (fn: (s: GrayscaleState) => GrayscaleState) => void store.update(fn);
	const skipped = host ? !appliesTo({ ...state, on: true, strength: 100 }, host) : false;

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
				<div>
					<p className="font-semibold">Black and white</p>
					<p className="text-sm text-muted">{state.on ? 'On for every site you visit' : 'Off'}</p>
				</div>
				<Switch label="Black and white" checked={state.on} onChange={(on) => change((s) => ({ ...s, on }))} />
			</div>

			<label className="grid gap-2 rounded-lg border border-line bg-surface p-4">
				<span className="flex justify-between text-sm">
					<span className="font-medium">Strength</span>
					<span className="text-muted tabular-nums">{state.strength}%</span>
				</span>
				<input
					type="range"
					min={10}
					max={100}
					step={5}
					value={state.strength}
					onChange={(e) => {
						const strength = Number(e.target.value);
						setState((s) => ({ ...s, strength }));
						change((s) => ({ ...s, strength }));
					}}
					className="accent-[var(--tb-accent)]"
				/>
			</label>

			<div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
				<div className="min-w-0">
					<p className="font-medium">Keep this site in colour</p>
					<p className="truncate text-sm text-muted">{host ?? 'Not available on browser pages'}</p>
				</div>
				<Switch
					label={`Keep ${host ?? 'this site'} in colour`}
					checked={skipped}
					disabled={!host}
					onChange={() => host && change((s) => toggleSkip(s, host))}
				/>
			</div>

			<section className="grid gap-2">
				<h3 className="text-sm font-semibold">Sites kept in colour</h3>
				{state.skip.length ? (
					<ul className="rounded-md border border-line bg-surface px-3">
						{state.skip.map((s) => (
							<li key={s} className="flex min-h-10 items-center justify-between border-t border-line first:border-t-0">
								<span className="text-sm">{s}</span>
								<IconButton label={`Turn ${s} black and white again`} onClick={() => change((st) => toggleSkip(st, s))}>
									<X size={16} />
								</IconButton>
							</li>
						))}
					</ul>
				) : (
					<EmptyState
						title="Every site goes black and white"
						body="Switch on “Keep this site in colour” on a site that needs its colours, like a design tool."
					/>
				)}
			</section>
		</div>
	);
}
