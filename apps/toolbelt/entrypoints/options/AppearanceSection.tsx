// Appearance: one theme for every tool. Changes apply instantly here, in the side panel and on pages.
import {
	ACCENTS,
	setTheme,
	type Accent,
	type Contrast,
	type Corners,
	type Density,
	type FontChoice,
	type Motion,
	type RailStyle,
	type TextSize,
	type Theme,
	type ThemeMode
} from '@toolbelt/core';
import {
	ACCENT_COLORS,
	Badge,
	Button,
	Input,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Segmented,
	Switch,
	accentFor,
	cn,
	resolveMode,
	showError,
	useSettings
} from '@toolbelt/ui';
import { Check, Monitor, Moon, Pipette, Sun } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { SettingsGroup, SettingsHeader, SettingsRow, useMediaQuery } from './shared.tsx';

const HEX = /^#[0-9a-f]{6}$/i;
/** Where the custom colour picker starts before you have picked one. */
const DEFAULT_CUSTOM = ACCENT_COLORS.toolbelt.light as `#${string}`;

type Mode = 'light' | 'dark';

function Swatch({
	accent,
	mode,
	name,
	selected,
	onSelect,
	onKeyDown
}: {
	accent: Accent;
	mode: Mode;
	name: string;
	selected: boolean;
	onSelect: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
	const colors = accentFor(accent, mode);
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={name}
			title={name}
			tabIndex={selected ? 0 : -1}
			onClick={onSelect}
			onKeyDown={onKeyDown}
			className="grid size-5 place-items-center rounded-full ring-offset-2 ring-offset-surface outline-none focus-visible:ring-2 focus-visible:ring-accent aria-checked:ring-2 aria-checked:ring-ink"
			style={{ background: colors.accent, color: colors.onAccent }}
		>
			{selected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
		</button>
	);
}

function CustomAccent({ theme, mode, onPick }: { theme: Theme; mode: Mode; onPick: (hex: `#${string}`) => void }) {
	const custom = theme.accent.startsWith('#') ? (theme.accent as `#${string}`) : null;
	const [draft, setDraft] = useState<string>(custom ?? DEFAULT_CUSTOM);
	const colors = custom ? accentFor(custom, mode) : null;
	return (
		<Popover onOpenChange={(open) => open && setDraft(custom ?? DEFAULT_CUSTOM)}>
			<PopoverTrigger
				role="radio"
				aria-checked={!!custom}
				aria-label="Your own colour"
				title="Your own colour"
				className={cn(
					'grid size-5 place-items-center rounded-full ring-offset-2 ring-offset-surface outline-none focus-visible:ring-2 focus-visible:ring-accent',
					custom ? 'ring-2 ring-ink' : 'border border-dashed border-line-strong text-muted'
				)}
				style={colors ? { background: colors.accent, color: colors.onAccent } : undefined}
			>
				{custom ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : <Pipette size={12} aria-hidden="true" />}
			</PopoverTrigger>
			<PopoverContent className="grid w-56 gap-2 p-2.5">
				<p className="text-sm font-medium">Your own colour</p>
				<div className="flex items-center gap-2">
					<input
						type="color"
						value={HEX.test(draft) ? draft : DEFAULT_CUSTOM}
						onChange={(e) => {
							setDraft(e.target.value);
							onPick(e.target.value as `#${string}`);
						}}
						aria-label="Pick your own accent colour"
						className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-0.5"
					/>
					<Input
						aria-label="Accent colour as hex"
						value={draft}
						spellCheck={false}
						aria-invalid={!HEX.test(draft) || undefined}
						onChange={(e) => {
							const v = e.target.value.trim();
							setDraft(v);
							if (HEX.test(v)) onPick(v.toLowerCase() as `#${string}`);
						}}
						className="font-mono text-sm"
					/>
				</div>
				<p className="text-xs text-faint">Text on it switches to black or white for contrast.</p>
			</PopoverContent>
		</Popover>
	);
}

function AccentPicker({ theme, mode, onChange }: { theme: Theme; mode: Mode; onChange: (a: Accent) => void }) {
	const group = useRef<HTMLDivElement>(null);
	function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!step) return;
		e.preventDefault();
		const next = (index + step + ACCENTS.length) % ACCENTS.length;
		onChange(ACCENTS[next]!);
		group.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus();
	}
	return (
		<div ref={group} role="radiogroup" aria-label="Accent" className="flex items-center gap-2.5 px-1">
			{ACCENTS.map((a, i) => (
				<Swatch
					key={a}
					accent={a}
					mode={mode}
					name={ACCENT_COLORS[a].name}
					selected={theme.accent === a}
					onSelect={() => onChange(a)}
					onKeyDown={(e) => onKeyDown(e, i)}
				/>
			))}
			<span className="h-4 w-px bg-line" aria-hidden="true" />
			<CustomAccent theme={theme} mode={mode} onPick={onChange} />
		</div>
	);
}

/** A tiny live sample: the controls you just restyled. */
function Sample() {
	const [on, setOn] = useState(true);
	return (
		<div className="flex flex-wrap items-center gap-2" aria-label="Sample">
			<Button size="sm" variant="primary">
				Primary
			</Button>
			<Button size="sm">Secondary</Button>
			<Switch size="sm" label="Sample switch" checked={on} onChange={setOn} />
			<Badge tone="accent">Badge</Badge>
			<span className="text-sm text-accent-ink">Link</span>
		</div>
	);
}

export function AppearanceSection() {
	const { settings, update } = useSettings();
	const theme = settings.theme;
	const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
	const mode = resolveMode(theme.mode, prefersDark);
	const change = (patch: Partial<Theme>) => {
		update((s) => setTheme(s, patch)).catch((e: unknown) => showError(e));
	};

	return (
		<section aria-labelledby="appearance-title" className="grid gap-5">
			<SettingsHeader
				id="appearance-title"
				title="Appearance"
				description="One look for every tool: the side panel, the dashboard and on pages."
			/>

			<SettingsGroup title="Colour">
				<SettingsRow label="Mode" hint={theme.mode === 'system' ? `Following your computer (${mode})` : undefined}>
					<Segmented<ThemeMode>
						label="Mode"
						value={theme.mode}
						onChange={(m) => change({ mode: m })}
						options={[
							{ value: 'system', label: 'System', icon: <Monitor aria-hidden="true" /> },
							{ value: 'light', label: 'Light', icon: <Sun aria-hidden="true" /> },
							{ value: 'dark', label: 'Dark', icon: <Moon aria-hidden="true" /> }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Accent" hint="Buttons, switches, focus and the selected tool.">
					<AccentPicker theme={theme} mode={mode} onChange={(accent) => change({ accent })} />
				</SettingsRow>
				<SettingsRow label="Contrast" hint="High darkens secondary text and lines.">
					<Segmented<Contrast>
						label="Contrast"
						value={theme.contrast}
						onChange={(c) => change({ contrast: c })}
						options={[
							{ value: 'standard', label: 'Standard' },
							{ value: 'high', label: 'High' }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Preview">
					<Sample />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Text">
				<SettingsRow label="Text size">
					<Segmented<TextSize>
						label="Text size"
						value={theme.textSize}
						onChange={(t) => change({ textSize: t })}
						options={[
							{ value: 'small', label: 'Small' },
							{ value: 'default', label: 'Default' },
							{ value: 'large', label: 'Large' },
							{ value: 'larger', label: 'Larger' }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Font" hint="Toolbelt’s typeface, or your computer’s.">
					<Segmented<FontChoice>
						label="Font"
						value={theme.font}
						onChange={(f) => change({ font: f })}
						options={[
							{ value: 'toolbelt', label: 'Toolbelt' },
							{ value: 'system', label: 'System' }
						]}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Layout and motion">
				<SettingsRow label="Density" hint="Compact fits more in the side panel.">
					<Segmented<Density>
						label="Density"
						value={theme.density}
						onChange={(d) => change({ density: d })}
						options={[
							{ value: 'compact', label: 'Compact' },
							{ value: 'comfortable', label: 'Comfortable' }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Corners">
					<Segmented<Corners>
						label="Corners"
						value={theme.corners}
						onChange={(c) => change({ corners: c })}
						options={[
							{ value: 'sharp', label: 'Sharp' },
							{ value: 'soft', label: 'Soft' },
							{ value: 'round', label: 'Round' }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Dock labels" hint="The tool dock at the bottom of the side panel.">
					<Segmented<RailStyle>
						label="Dock labels"
						value={theme.rail}
						onChange={(r) => change({ rail: r })}
						options={[
							{ value: 'icons', label: 'Icons only' },
							{ value: 'labels', label: 'Show active name' }
						]}
					/>
				</SettingsRow>
				<SettingsRow label="Motion" hint="Reduced turns off movement in menus and tool switches.">
					<Segmented<Motion>
						label="Motion"
						value={theme.motion}
						onChange={(m) => change({ motion: m })}
						options={[
							{ value: 'full', label: 'Full' },
							{ value: 'reduced', label: 'Reduced' }
						]}
					/>
				</SettingsRow>
			</SettingsGroup>
		</section>
	);
}
