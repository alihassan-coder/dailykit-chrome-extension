// "From this page": the eight main colours of the website in the active tab, as swatches to use or copy.
import { AppFailure, appError, toAppError, type AppError, type AppErrorAction } from '@toolbelt/core';
import { Button, ErrorNotice, IconButton, Section, Tooltip, cn, showError } from '@toolbelt/ui';
import { Check, Copy, Palette, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { formats, rankColors, type Hex, type PaletteColor } from './colors.ts';
import { collectPageColors } from './page-colors.ts';

type State =
	| { state: 'idle' }
	| { state: 'loading' }
	| { state: 'ready'; colors: PaletteColor[]; site: string }
	| { state: 'error'; error: AppError };

const siteOf = (url: string | undefined) => {
	try {
		return url ? new URL(url).hostname.replace(/^www\./, '') : '';
	} catch {
		return '';
	}
};

/** Copies text; a blocked clipboard is a toast with "Try again", never silent. Resolves whether it worked. */
export async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		showError(
			appError(
				'unknown',
				{},
				{
					title: 'Couldn’t copy',
					message: 'The browser blocked the clipboard. Try again, or select the value and copy it by hand.'
				}
			),
			{ onAction: (kind) => kind === 'retry' && void copyText(value) }
		);
		return false;
	}
}

/** Reads the page in the active tab. Failures (no tab, no site access, a browser page) are thrown for the panel. */
export async function readPagePalette(): Promise<{ colors: PaletteColor[]; site: string }> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (tab?.id === undefined) throw new AppFailure(appError('no_tab'));
	const [frame] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageColors });
	const samples = Array.isArray(frame?.result) ? (frame.result as [string, number][]) : [];
	return { colors: rankColors(samples, 8), site: siteOf(tab.url) };
}

function Swatch({ color, current, onUse }: { color: PaletteColor; current: boolean; onUse: (hex: Hex) => void }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const hex = formats(color.hex).hex;
	const percent = Math.max(1, Math.round(color.share * 100));
	return (
		<div className={cn('group flex h-7 min-w-0 items-center gap-2 pr-1 pl-2', current && 'bg-hover')}>
			<button
				type="button"
				onClick={() => onUse(color.hex)}
				aria-label={`Use ${hex}`}
				aria-pressed={current}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
			>
				{/* The page's colour is data, so it is an inline style rather than a token. */}
				<span
					aria-hidden="true"
					className="size-4 shrink-0 rounded-xs shadow-[inset_0_0_0_1px_var(--tb-line-strong)]"
					style={{ background: color.hex }}
				/>
				<code className="tb-num min-w-0 flex-1 truncate font-mono text-sm text-ink">{hex}</code>
				<span className="tb-num shrink-0 text-xs text-faint">{percent}%</span>
			</button>
			<IconButton
				size="xs"
				label={copied ? `Copied ${hex}` : `Copy ${hex}`}
				onClick={() =>
					void copyText(hex).then((ok) => {
						if (!ok) return;
						setCopied(true);
						clearTimeout(timer.current);
						timer.current = setTimeout(() => setCopied(false), 1200);
					})
				}
			>
				{copied ? <Check className="text-ok" aria-hidden="true" /> : <Copy aria-hidden="true" />}
			</IconButton>
		</div>
	);
}

export function PagePalette({
	current,
	onUse,
	onLoaded
}: {
	current: Hex;
	onUse: (hex: Hex) => void;
	/** The colours found, for the contrast check to offer. */
	onLoaded?: (colors: Hex[]) => void;
}) {
	const [palette, setPalette] = useState<State>({ state: 'idle' });

	async function load() {
		setPalette({ state: 'loading' });
		try {
			const found = await readPagePalette();
			setPalette({ state: 'ready', ...found });
			onLoaded?.(found.colors.map((c) => c.hex));
		} catch (error) {
			setPalette({ state: 'error', error: toAppError(error) });
		}
	}

	function onAction(kind: AppErrorAction) {
		if (kind === 'retry') void load();
		else if (kind === 'grant-access') {
			// Straight from the click: the browser only asks for site access during a user gesture.
			browser.tabs
				.query({ active: true, currentWindow: true })
				.then(([tab]) => {
					const origin = tab?.url ? new URL(tab.url).origin : '';
					return browser.permissions.request({ origins: [origin ? `${origin}/*` : '<all_urls>'] });
				})
				.then((granted) => {
					if (granted) return load();
				})
				.catch((error: unknown) => void showError(error));
		} else if (kind === 'reload-tab')
			browser.tabs
				.reload()
				.then(() => setPalette({ state: 'idle' }))
				.catch((error: unknown) => void showError(error));
	}

	const ready = palette.state === 'ready' ? palette : null;
	return (
		<Section
			title={ready?.site ? `From ${ready.site}` : 'From this page'}
			count={ready?.colors.length || undefined}
			action={
				ready && (
					<IconButton size="xs" label="Read the page again" onClick={() => void load()}>
						<RefreshCw aria-hidden="true" />
					</IconButton>
				)
			}
		>
			{palette.state === 'error' ? (
				<ErrorNotice error={palette.error} onAction={onAction} onDismiss={() => setPalette({ state: 'idle' })} />
			) : ready ? (
				ready.colors.length ? (
					<div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface">
						{ready.colors.map((c) => (
							<Swatch key={c.hex} color={c} current={c.hex === current} onUse={onUse} />
						))}
					</div>
				) : (
					<p className="px-0.5 text-sm text-faint">No colours found on this page.</p>
				)
			) : (
				<div className="flex min-w-0 items-center gap-2 px-0.5">
					<Tooltip label="Find the eight main colours of the page in this tab" side="bottom">
						<Button
							size="sm"
							icon={<Palette aria-hidden="true" strokeWidth={1.75} />}
							loading={palette.state === 'loading'}
							onClick={() => void load()}
						>
							Get page palette
						</Button>
					</Tooltip>
					<span className="min-w-0 truncate text-sm text-faint">Top 8 colours, with copy</span>
				</div>
			)}
		</Section>
	);
}
