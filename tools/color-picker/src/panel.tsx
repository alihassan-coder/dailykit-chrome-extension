// Colour picker, shown in the side panel. Picks from anywhere on screen with the browser's EyeDropper.
import { featureOn, toolValue } from '@toolbelt/core';
import { Button, EmptyState, IconButton, localArea, useSettings } from '@toolbelt/ui';
import { Check, Copy, Pipette, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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

function CopyRow({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	async function copy() {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	}
	return (
		<div className="flex min-h-8 items-center justify-between gap-2 border-t border-line first:border-t-0">
			<span className="w-10 text-xs text-muted">{label}</span>
			<code className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums">{value}</code>
			<IconButton label={copied ? `Copied ${label}` : `Copy ${label}`} onClick={copy}>
				{copied ? <Check size={16} className="text-ok" /> : <Copy size={16} />}
			</IconButton>
		</div>
	);
}

function ContrastCheck({ color }: { color: Hex }) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{(['#ffffff', '#000000'] as const).map((text) => {
				const ratio = contrastRatio(color, text);
				return (
					<div key={text} className="rounded-lg px-3 py-2" style={{ background: color, color: text }}>
						<p className="text-lg font-semibold">Aa</p>
						<p className="text-xs tabular-nums">{ratio.toFixed(2)} : 1</p>
						<p className="text-xs font-semibold">{wcagLevel(ratio)}</p>
					</div>
				);
			})}
		</div>
	);
}

export default function ColorPickerPanel() {
	const { settings } = useSettings();
	const keepHistory = featureOn(settings, 'color-picker', 'history');
	const [color, setColor] = useState<Hex>('#2e55e6');
	const [saved, setSaved] = useState<Hex[]>([]);
	const canPick = typeof window.EyeDropper === 'function';

	useEffect(() => {
		history.get().then((h) => {
			setSaved(h);
			if (h[0]) setColor(h[0]);
		});
		return history.subscribe(setSaved);
	}, []);

	function choose(hex: Hex) {
		setColor(hex);
		if (keepHistory) void history.update((h) => addToHistory(h, hex));
	}

	async function pick() {
		try {
			const result = await new window.EyeDropper!().open();
			const hex = normalizeHex(result.sRGBHex);
			if (hex) choose(hex);
		} catch {
			// Escape closes the eyedropper; that is not an error worth showing.
		}
	}

	const f = formats(color);

	return (
		<div className="grid gap-3 @md:grid-cols-2 @md:items-start">
			<div className="grid gap-3">
				<div className="flex items-center gap-3">
					<span
						className="size-10 shrink-0 rounded-lg shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]"
						style={{ background: color }}
					/>
					<div className="min-w-0">
						<p className="text-lg font-semibold tabular-nums">{f.hex}</p>
						<p className="text-xs text-muted">
							{wcagLevel(contrastRatio(color, '#ffffff'))} on white, {contrastRatio(color, '#ffffff').toFixed(1)} : 1
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button variant="primary" icon={<Pipette size={16} />} onClick={pick} disabled={!canPick} className="flex-1">
						Pick from screen
					</Button>
					<label className="relative inline-flex min-h-8 cursor-pointer items-center rounded-full bg-accent-soft px-3.5 text-base font-medium text-accent">
						Adjust
						<input
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value as Hex)}
							onBlur={(e) => choose(e.target.value as Hex)}
							className="absolute inset-0 cursor-pointer opacity-0"
							aria-label="Adjust colour"
						/>
					</label>
				</div>
				{!canPick && <p className="text-xs text-muted">This browser has no screen eyedropper. Use Adjust instead.</p>}
			</div>

			<div className="rounded-lg border border-line bg-surface px-2">
				<CopyRow label="HEX" value={f.hex} />
				<CopyRow label="RGB" value={f.rgb} />
				<CopyRow label="HSL" value={f.hsl} />
			</div>

			<section className="grid gap-1.5 @md:col-span-2">
				<h3 className="text-xs font-semibold text-muted">Text on this colour</h3>
				<ContrastCheck color={color} />
			</section>

			{keepHistory && (
				<section className="grid gap-1.5 @md:col-span-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-semibold text-muted">Recent colours</h3>
						{saved.length > 0 && (
							<IconButton label="Clear recent colours" onClick={() => history.set([])}>
								<Trash2 size={16} />
							</IconButton>
						)}
					</div>
					{saved.length ? (
						<div className="grid grid-cols-10 gap-1 @md:grid-cols-16">
							{saved.map((hex) => (
								<button
									key={hex}
									type="button"
									title={hex.toUpperCase()}
									aria-label={`Use ${hex.toUpperCase()}`}
									onClick={() => setColor(hex)}
									className="aspect-square rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] transition-transform hover:scale-110"
									style={{ background: hex }}
								/>
							))}
						</div>
					) : (
						<EmptyState title="No colours yet" body="Colours you pick or adjust are kept here, on this device." />
					)}
				</section>
			)}
		</div>
	);
}
