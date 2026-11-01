// Black-and-white controls in the side panel: on/off, strength, and keeping the current site in colour.
import { toolValue } from '@toolbelt/core';
import { Card, EmptyRow, IconButton, Section, Switch, localArea } from '@toolbelt/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
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
	// null until the saved state arrives, so the switch doesn't animate from Off to On on open.
	const [state, setState] = useState<GrayscaleState | null>(null);
	const host = useCurrentSite();

	useEffect(() => {
		void store.get().then(setState);
		return store.subscribe(setState);
	}, []);

	if (!state) return null;
	const change = (fn: (s: GrayscaleState) => GrayscaleState) => void store.update(fn);
	const skipped = host ? !appliesTo({ ...state, on: true, strength: 100 }, host) : false;

	return (
		<div className="grid min-w-0 gap-3">
			<Card list>
				<div className="flex items-center justify-between gap-3 p-3">
					<div className="min-w-0">
						<p className="text-base font-semibold">Black and white</p>
						<p className="text-sm text-muted">{state.on ? 'On for every site you visit' : 'Off'}</p>
					</div>
					<Switch label="Black and white" checked={state.on} onChange={(on) => change((s) => ({ ...s, on }))} />
				</div>

				<label className="grid gap-2 p-3">
					<span className="flex justify-between text-base">
						<span className="font-medium">Strength</span>
						<span className="text-muted tabular-nums">{state.strength}%</span>
					</span>
					<input
						type="range"
						min={10}
						max={100}
						step={5}
						value={state.strength}
						// The thumb follows instantly; storage is written once you let go.
						onChange={(e) => {
							const strength = Number(e.target.value);
							setState((s) => s && { ...s, strength });
						}}
						onPointerUp={(e) => {
							const strength = Number(e.currentTarget.value);
							change((s) => ({ ...s, strength }));
						}}
						onKeyUp={(e) => {
							const strength = Number(e.currentTarget.value);
							change((s) => ({ ...s, strength }));
						}}
						className="w-full accent-[var(--tb-accent)]"
					/>
				</label>

				<div className="flex items-center justify-between gap-3 p-3">
					<div className="min-w-0">
						<p className="text-base font-medium">Keep this site in colour</p>
						<p className="truncate text-sm text-muted" title={host ?? undefined}>
							{host ?? 'Not available on browser pages'}
						</p>
					</div>
					<Switch
						label={`Keep ${host ?? 'this site'} in colour`}
						checked={skipped}
						disabled={!host}
						onChange={() => host && change((s) => toggleSkip(s, host))}
					/>
				</div>
			</Card>

			<Section title="Sites kept in colour">
				{state.skip.length ? (
					<Card list>
						{state.skip.map((s) => (
							<div key={s} className="flex min-h-11 min-w-0 items-center justify-between gap-2 pr-1.5 pl-3">
								<span className="min-w-0 truncate text-base" title={s}>
									{s}
								</span>
								<IconButton label={`Turn ${s} black and white again`} onClick={() => change((st) => toggleSkip(st, s))}>
									<X size={16} />
								</IconButton>
							</div>
						))}
					</Card>
				) : (
					<Card>
						<EmptyRow>
							Every site goes black and white. Switch on “Keep this site in colour” on a site that needs its colours.
						</EmptyRow>
					</Card>
				)}
			</Section>
		</div>
	);
}
