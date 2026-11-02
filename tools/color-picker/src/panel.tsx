// Colour picker, shown in the side panel. Picks from anywhere on screen with the browser's EyeDropper.
import { appError, featureOn, toolValue } from '@toolbelt/core';
import {
	Badge,
	Button,
	Card,
	EmptyRow,
	IconButton,
	Kbd,
	Section,
	Tooltip,
	cn,
	localArea,
	showError,
	useSettings
} from '@toolbelt/ui';
import { Check, Copy, Pipette, Trash2 } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { addToHistory, contrastRatio, formats, normalizeHex, wcagLevel, type Hex } from './colors.ts';

// EyeDropper is Chromium-only and not in TypeScript's DOM types yet.
declare global {
	interface Window {
		EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
	}
}

const asColorList = (raw: unknown): Hex[] =>
	Array.isArray(raw) ? raw.flatMap((v) => (typeof v === 'string' && normalizeHex(v) ? [normalizeHex(v)!] : [])) : [];
const history = toolValue(localArea, 'color-picker', 'history', asColorList);

/** Saving the history is a background write: a failure is a toast, never silent. */
const saveFailed = (err: unknown) => void showError(err);

const PICK_KEY = 'e';

const FORMAT_ROWS = [
	{ key: 'hex', label: 'HEX' },
	{ key: 'rgb', label: 'RGB' },
	{ key: 'hsl', label: 'HSL' },
	{ key: 'oklch', label: 'OKLCH' },
	{ key: 'css', label: 'CSS' }
] as const;

/** One format of the colour. The whole 28 px row copies; the icon turns into a check for a moment. */
function CopyRow({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
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
				{ onAction: (kind) => kind === 'retry' && void copy() }
			);
			return;
		}
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1200);
	}

	return (
		<button
			type="button"
			onClick={copy}
			aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
			className="group flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 px-2.5 text-left hover:bg-hover"
		>
			<span className="w-11 shrink-0 text-xs font-medium text-faint">{label}</span>
			<code className="tb-num min-w-0 flex-1 truncate font-mono text-sm text-ink">{value}</code>
			{copied ? (
				<Check aria-hidden="true" className="size-3.5 shrink-0 text-ok" />
			) : (
				<Copy
					aria-hidden="true"
					className="size-3.5 shrink-0 text-faint opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
				/>
			)}
		</button>
	);
}

/** "AA 5.9" for white or black text on the colour, with a tiny sample of that text. */
function ContrastBadge({ color, text }: { color: Hex; text: '#ffffff' | '#000000' }) {
	const ratio = contrastRatio(color, text);
	const level = wcagLevel(ratio);
	const name = text === '#ffffff' ? 'White' : 'Black';
	const short = level === 'Large text only' ? 'AA large' : level === 'Fails' ? 'Fail' : level;
	return (
		<Tooltip label={`${name} text: ${level}, ${ratio.toFixed(2)} : 1`} side="bottom">
			<Badge
				tone={level === 'Fails' ? 'danger' : level === 'Large text only' ? 'warn' : 'ok'}
				tabIndex={0}
				aria-label={`${name} text: ${level}, ${ratio.toFixed(1)} to 1`}
				className="gap-1 pl-0.5"
			>
				{/* The picked colour is data, so it is an inline style rather than a token. */}
				<span
					aria-hidden="true"
					className="grid h-4 w-5 place-items-center rounded-xs text-2xs font-semibold"
					style={{ background: color, color: text }}
				>
					Aa
				</span>
				<span>{short}</span>
				<span className="tb-num opacity-80">{ratio.toFixed(1)}</span>
			</Badge>
		</Tooltip>
	);
}

const typing = (el: EventTarget | null) =>
	el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export default function ColorPickerPanel() {
	const { settings } = useSettings();
	const keepHistory = featureOn(settings, 'color-picker', 'history');
	const [color, setColor] = useState<Hex>('#2e55e6');
	const [saved, setSaved] = useState<Hex[]>([]);
	const input = useRef<HTMLInputElement>(null);
	const canPick = typeof window.EyeDropper === 'function';

	useEffect(() => {
		history
			.get()
			.then((h) => {
				setSaved(h);
				if (h[0]) setColor(h[0]);
			})
			.catch(saveFailed);
		return history.subscribe(setSaved);
	}, []);

	function choose(hex: Hex) {
		setColor(hex);
		if (keepHistory) history.update((h) => addToHistory(h, hex)).catch(saveFailed);
	}

	async function pick() {
		if (!window.EyeDropper) return;
		try {
			const result = await new window.EyeDropper().open();
			const hex = normalizeHex(result.sRGBHex);
			if (hex) choose(hex);
		} catch (err) {
			// Escape closes the eyedropper with an AbortError; showError leaves that one out.
			showError(err);
		}
	}
	// E picks from screen, unless you're typing somewhere.
	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if (e.key.toLowerCase() !== PICK_KEY || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target)) return;
		e.preventDefault();
		void pick();
	});
	useEffect(() => {
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	// The native picker reports every drag step as "input" and the final choice as "change": only that one is kept.
	const onCommit = useEffectEvent((value: string) => {
		const hex = normalizeHex(value);
		if (hex) choose(hex);
	});
	useEffect(() => {
		const el = input.current;
		if (!el) return;
		const onChange = () => onCommit(el.value);
		el.addEventListener('change', onChange);
		return () => el.removeEventListener('change', onChange);
	}, []);

	function adjust() {
		const el = input.current;
		if (!el) return;
		try {
			el.showPicker();
		} catch {
			el.click(); // Older browsers, and test DOMs, have no showPicker.
		}
	}

	const f = formats(color);

	return (
		<div className="grid min-w-0 gap-3">
			<div className="grid gap-1.5">
				<div className="flex min-w-0 items-center gap-2.5">
					<Tooltip label="Adjust colour" side="bottom">
						<button
							type="button"
							onClick={adjust}
							aria-label="Adjust colour"
							className="size-10 shrink-0 cursor-pointer rounded-lg shadow-[inset_0_0_0_1px_var(--tb-line-strong)]"
							// The picked colour is data, so it is an inline style rather than a token.
							style={{ background: color }}
						/>
					</Tooltip>
					<input
						ref={input}
						type="color"
						value={color}
						onChange={(e) => setColor(e.target.value as Hex)}
						tabIndex={-1}
						aria-hidden="true"
						className="pointer-events-none absolute size-px opacity-0"
					/>
					<div className="grid min-w-0 flex-1 gap-1">
						<p className="truncate font-mono text-lg leading-5 font-semibold text-ink">{f.hex}</p>
						<div className="flex min-w-0 flex-wrap items-center gap-1">
							<ContrastBadge color={color} text="#ffffff" />
							<ContrastBadge color={color} text="#000000" />
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						icon={<Pipette aria-hidden="true" strokeWidth={1.75} />}
						onClick={pick}
						disabled={!canPick}
						aria-keyshortcuts={PICK_KEY.toUpperCase()}
						className="self-start"
					>
						Eyedropper
						<Kbd className="border-on-accent/30 bg-on-accent/15 text-on-accent">{PICK_KEY.toUpperCase()}</Kbd>
					</Button>
				</div>
				{!canPick && (
					<p className="text-sm text-faint">
						This browser has no screen eyedropper. Click the swatch to adjust instead.
					</p>
				)}
			</div>

			<Card list>
				{FORMAT_ROWS.map((row) => (
					<CopyRow key={row.key} label={row.label} value={f[row.key]} />
				))}
			</Card>

			{keepHistory && (
				<Section
					title="Recent colours"
					count={saved.length || undefined}
					action={
						saved.length > 0 && (
							<IconButton size="xs" label="Clear recent colours" onClick={() => history.set([]).catch(saveFailed)}>
								<Trash2 aria-hidden="true" />
							</IconButton>
						)
					}
				>
					{saved.length ? (
						<div className="flex flex-wrap gap-1">
							{saved.map((hex) => (
								<Tooltip key={hex} label={hex.toUpperCase()} side="bottom">
									<button
										type="button"
										aria-label={`Use ${hex.toUpperCase()}`}
										aria-pressed={hex === color}
										onClick={() => setColor(hex)}
										className={cn(
											'size-5 cursor-pointer rounded-xs shadow-[inset_0_0_0_1px_var(--tb-line-strong)]',
											hex === color && 'ring-2 ring-accent-ink ring-offset-1 ring-offset-bg'
										)}
										style={{ background: hex }}
									/>
								</Tooltip>
							))}
						</div>
					) : (
						<Card list>
							<EmptyRow>
								<span className="text-muted">No colours yet</span>
								{canPick ? (
									<>
										{' '}
										· press <Kbd>{PICK_KEY.toUpperCase()}</Kbd> to pick one from the screen
									</>
								) : (
									' · colours you adjust are kept here, on this device'
								)}
							</EmptyRow>
						</Card>
					)}
				</Section>
			)}
		</div>
	);
}
