// Appearance: one theme for every tool. Changes apply instantly here, in the side panel and on pages.
import {
	ACCENTS,
	setTheme,
	type AccentPreset,
	type Contrast,
	type Corners,
	type Density,
	type FontChoice,
	type Motion,
	type RailStyle,
	type TextSize,
	type ThemeMode
} from '@toolbelt/core';
import { ACCENT_COLORS, Button, Segmented, Switch, ToolMark, accentFor, resolveMode, useSettings } from '@toolbelt/ui';
import { Check, Pipette } from 'lucide-react';
import CairnIcon from '@toolbelt/tool-cairn/icon';
import type { ReactNode } from 'react';

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
	return (
		<div className="grid gap-3 border-t border-line py-5 first:border-t-0 sm:grid-cols-[200px_1fr] sm:items-center">
			<div>
				<p className="font-medium">{label}</p>
				<p className="text-sm text-muted">{hint}</p>
			</div>
			<div>{children}</div>
		</div>
	);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-2">
			<h3 className="text-sm font-semibold text-muted">{title}</h3>
			<div className="rounded-lg border border-line bg-surface px-5">{children}</div>
		</section>
	);
}

function Preview() {
	return (
		<div className="grid gap-3 rounded-lg border border-line bg-bg p-4" aria-label="Preview">
			<div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
				<ToolMark name="Cairn" icon={<CairnIcon size={18} />} active />
				<div className="min-w-0 flex-1">
					<p className="font-semibold">Cairn</p>
					<p className="truncate text-sm text-muted">Save private Claude and ChatGPT chats</p>
				</div>
				<Switch label="Preview switch" checked onChange={() => {}} />
			</div>
			<div className="flex gap-2">
				<Button variant="primary">Save chat</Button>
				<Button>Open library</Button>
			</div>
		</div>
	);
}

export function AppearanceSection() {
	const { settings, update } = useSettings();
	const theme = settings.theme;
	const change = (patch: Parameters<typeof setTheme>[1]) => void update((s) => setTheme(s, patch));
	const mode = resolveMode(theme.mode, matchMedia('(prefers-color-scheme: dark)').matches);
	const custom = theme.accent.startsWith('#') ? theme.accent : null;

	return (
		<section aria-labelledby="appearance-title" className="grid gap-6">
			<div>
				<h2 id="appearance-title" className="text-xl font-semibold">
					Appearance
				</h2>
				<p className="text-sm text-muted">One look for every tool, in the side panel, the dashboard and on pages.</p>
			</div>

			<Preview />

			<Group title="Colour">
				<Field label="Mode" hint="Follow your computer, or pick one.">
					<Segmented<ThemeMode>
						label="Mode"
						value={theme.mode}
						onChange={(m) => change({ mode: m })}
						options={[
							{ value: 'system', label: 'System' },
							{ value: 'light', label: 'Light' },
							{ value: 'dark', label: 'Dark' }
						]}
					/>
				</Field>

				<Field label="Accent" hint="Buttons, switches, focus and the selected tool. Pick a preset or any colour.">
					<div role="radiogroup" aria-label="Accent" className="flex flex-wrap items-center gap-2">
						{ACCENTS.map((a: AccentPreset) => {
							const { accent, onAccent } = accentFor(a, mode);
							const selected = theme.accent === a;
							return (
								<button
									key={a}
									type="button"
									role="radio"
									aria-checked={selected}
									aria-label={ACCENT_COLORS[a].name}
									title={ACCENT_COLORS[a].name}
									onClick={() => change({ accent: a })}
									className="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface aria-checked:ring-2 aria-checked:ring-ink"
									style={{ background: accent }}
								>
									{selected && <Check size={16} color={onAccent} />}
								</button>
							);
						})}
						<label
							title="Your own colour"
							className={`relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-line ring-offset-2 ring-offset-surface ${custom ? 'ring-2 ring-ink' : ''}`}
							style={custom ? { background: accentFor(custom as `#${string}`, mode).accent } : undefined}
						>
							<Pipette size={16} color={custom ? accentFor(custom as `#${string}`, mode).onAccent : 'currentColor'} />
							<input
								type="color"
								value={custom ?? '#2e55e6'}
								onChange={(e) => change({ accent: e.target.value as `#${string}` })}
								aria-label="Pick your own accent colour"
								className="absolute inset-0 cursor-pointer opacity-0"
							/>
						</label>
					</div>
				</Field>

				<Field label="Contrast" hint="High contrast darkens secondary text and lines.">
					<Segmented<Contrast>
						label="Contrast"
						value={theme.contrast}
						onChange={(c) => change({ contrast: c })}
						options={[
							{ value: 'standard', label: 'Standard' },
							{ value: 'high', label: 'High' }
						]}
					/>
				</Field>
			</Group>

			<Group title="Text">
				<Field label="Text size" hint="Scales all text in Toolbelt.">
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
				</Field>

				<Field label="Font" hint="Toolbelt’s own typeface, or the one your computer uses.">
					<Segmented<FontChoice>
						label="Font"
						value={theme.font}
						onChange={(f) => change({ font: f })}
						options={[
							{ value: 'toolbelt', label: 'Toolbelt' },
							{ value: 'system', label: 'System' }
						]}
					/>
				</Field>
			</Group>

			<Group title="Layout and motion">
				<Field label="Density" hint="Compact fits more in the side panel.">
					<Segmented<Density>
						label="Density"
						value={theme.density}
						onChange={(d) => change({ density: d })}
						options={[
							{ value: 'compact', label: 'Compact' },
							{ value: 'comfortable', label: 'Comfortable' }
						]}
					/>
				</Field>

				<Field label="Corners" hint="How rounded cards, buttons and fields are.">
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
				</Field>

				<Field label="Side panel tools" hint="Show tool names next to their logos.">
					<Segmented<RailStyle>
						label="Side panel tools"
						value={theme.rail}
						onChange={(r) => change({ rail: r })}
						options={[
							{ value: 'icons', label: 'Logos only' },
							{ value: 'labels', label: 'Logos and names' }
						]}
					/>
				</Field>

				<Field label="Motion" hint="Reduced turns off movement when switching tools and opening menus.">
					<Segmented<Motion>
						label="Motion"
						value={theme.motion}
						onChange={(m) => change({ motion: m })}
						options={[
							{ value: 'full', label: 'Full' },
							{ value: 'reduced', label: 'Reduced' }
						]}
					/>
				</Field>
			</Group>
		</section>
	);
}
