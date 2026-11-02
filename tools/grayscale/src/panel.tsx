// Black-and-white controls in the side panel: on/off, strength, and the sites kept in colour.
import { toolValue } from '@toolbelt/core';
import { Card, IconButton, Section, Switch, cn, localArea, showError } from '@toolbelt/ui';
import { Globe, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { browser } from 'wxt/browser';
import { STATE_KEY, appliesTo, hostOf, resolveState, toggleSkip, type GrayscaleState } from './grayscale.ts';

const store = toolValue(localArea, 'grayscale', STATE_KEY, resolveState);

const MIN = 10;
const MAX = 100;

/** The site in the active tab of this side panel's window, kept up to date as the user switches tabs or navigates. */
function useCurrentSite() {
	const [host, setHost] = useState<string | null>(null);
	useEffect(() => {
		const read = () =>
			browser.tabs
				.query({ active: true, currentWindow: true })
				.then(([tab]) => setHost(hostOf(tab?.url)))
				// No tab to read means no site to offer; the row says "Not available".
				.catch(() => setHost(null));
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

/** A native range input on theme tokens: accent fill up to the thumb, a thumb like the Switch's. */
function StrengthSlider({
	value,
	onInput,
	onCommit
}: {
	value: number;
	onInput: (v: number) => void;
	onCommit: (v: number) => void;
}) {
	const fill = `${((value - MIN) / (MAX - MIN)) * 100}%`;
	return (
		<input
			type="range"
			min={MIN}
			max={MAX}
			step={5}
			value={value}
			aria-label="Strength"
			aria-valuetext={`${value}%`}
			// The thumb follows instantly; storage is written once you let go.
			onChange={(e) => onInput(Number(e.target.value))}
			onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
			onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
			style={{ '--fill': fill } as CSSProperties}
			className={cn(
				'h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent',
				// Track: accent up to the value, the switch's off colour after it.
				'[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--tb-accent)_var(--fill),var(--tb-switch-off)_var(--fill))]',
				'[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-switch-off [&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-accent',
				// Thumb.
				'[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line-strong [&::-webkit-slider-thumb]:bg-thumb [&::-webkit-slider-thumb]:shadow-xs',
				'[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-line-strong [&::-moz-range-thumb]:bg-thumb [&::-moz-range-thumb]:shadow-xs',
				// Inputs drop the global focus outline, so the thumb carries the focus ring.
				'focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-accent-ink',
				'focus-visible:[&::-moz-range-thumb]:outline-2 focus-visible:[&::-moz-range-thumb]:outline-offset-2 focus-visible:[&::-moz-range-thumb]:outline-accent-ink'
			)}
		/>
	);
}

function statusText(state: GrayscaleState): { main: string; meta?: string } {
	if (!state.on) return { main: 'Off' };
	const kept = state.skip.length;
	return { main: 'On for every site', meta: kept ? `${kept} kept in colour` : undefined };
}

export default function GrayscalePanel() {
	// null until the saved state arrives, so the switch doesn't animate from Off to On on open.
	const [state, setState] = useState<GrayscaleState | null>(null);
	// Sites switched back to black and white in this visit stay listed, so a slip is one click to undo.
	const [released, setReleased] = useState<string[]>([]);
	const host = useCurrentSite();

	useEffect(() => {
		store.get().then(setState, (err: unknown) => {
			showError(err);
			setState(resolveState(undefined));
		});
		return store.subscribe(setState);
	}, []);

	if (!state) return null;
	const change = (fn: (s: GrayscaleState) => GrayscaleState) =>
		void store.update(fn).catch((err: unknown) => showError(err));
	const skipped = host ? !appliesTo({ ...state, on: true, strength: 100 }, host) : false;
	const status = statusText(state);
	const rows = [...state.skip, ...released.filter((s) => !state.skip.includes(s))];

	const setKept = (site: string, keep: boolean) => {
		if (keep === state.skip.includes(site)) return;
		setReleased((r) => (keep ? r.filter((s) => s !== site) : [...r, site]));
		change((s) => toggleSkip(s, site));
	};
	const remove = (site: string) => {
		setReleased((r) => r.filter((s) => s !== site));
		if (state.skip.includes(site)) change((s) => toggleSkip(s, site));
	};

	return (
		<div className="grid min-w-0 gap-3">
			<Card list>
				<div className="flex h-10 min-w-0 items-center gap-2 pr-2.5 pl-3">
					<p className="min-w-0 truncate text-base">
						<span className="font-medium text-ink">{status.main}</span>
						{status.meta && <span className="tb-num text-sm text-faint"> · {status.meta}</span>}
					</p>
					<div className="ml-auto flex">
						<Switch label="Black and white" checked={state.on} onChange={(on) => change((s) => ({ ...s, on }))} />
					</div>
				</div>

				<div className="flex h-8 min-w-0 items-center gap-3 pr-2.5 pl-3">
					<span className="w-16 shrink-0 text-sm text-muted">Strength</span>
					<StrengthSlider
						value={state.strength}
						onInput={(strength) => setState((s) => s && { ...s, strength })}
						onCommit={(strength) => change((s) => ({ ...s, strength }))}
					/>
					<span className="tb-num w-9 shrink-0 text-right text-sm text-muted">{state.strength}%</span>
				</div>

				<div className="flex h-8 min-w-0 items-center gap-2 pr-2.5 pl-3">
					<span className="w-16 shrink-0 text-sm text-muted">This site</span>
					<span className="min-w-0 flex-1 truncate text-sm text-ink" title={host ?? undefined}>
						{host ?? <span className="text-faint">Not available on browser pages</span>}
					</span>
					<span className="text-sm text-faint">In colour</span>
					<Switch
						size="sm"
						label={`Keep ${host ?? 'this site'} in colour`}
						checked={skipped}
						disabled={!host}
						onChange={(keep) => host && setKept(host, keep)}
					/>
				</div>
			</Card>

			<Section title="Kept in colour" count={state.skip.length || undefined}>
				{rows.length ? (
					<Card list>
						{rows.map((site) => {
							const kept = state.skip.includes(site);
							return (
								<div key={site} className="group flex h-8 min-w-0 items-center gap-2 pr-2.5 pl-3">
									<Globe aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-faint" />
									<span className={cn('min-w-0 flex-1 truncate text-base', !kept && 'text-faint')} title={site}>
										{site}
									</span>
									<IconButton
										size="xs"
										label={`Remove ${site}`}
										onClick={() => remove(site)}
										className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
									>
										<X aria-hidden="true" />
									</IconButton>
									<Switch
										size="sm"
										label={`${site} in colour`}
										checked={kept}
										onChange={(keep) => setKept(site, keep)}
									/>
								</div>
							);
						})}
					</Card>
				) : (
					<p className="px-0.5 text-sm text-faint">
						<span className="text-muted">Every site goes black and white</span> · switch on “In colour” for a site that
						needs its colours.
					</p>
				)}
			</Section>
		</div>
	);
}
