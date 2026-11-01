// Appearance: one theme for every tool. Changes apply instantly here, in the side panel and on pages.
import { ACCENTS, setTheme, type Accent, type Corners, type Density, type ThemeMode } from '@toolbelt/core';
import { ACCENT_COLORS, Button, Segmented, Switch, ToolMark, resolveMode, useSettings } from '@toolbelt/ui';
import { Check } from 'lucide-react';
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

function Preview() {
	return (
		<div className="grid gap-3 rounded-lg border border-line bg-bg p-4" aria-label="Preview">
			<div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
				<ToolMark name="Cairn" active />
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

	return (
		<section aria-labelledby="appearance-title" className="grid gap-4">
			<div>
				<h2 id="appearance-title" className="text-xl font-semibold">
					Appearance
				</h2>
				<p className="text-sm text-muted">One look for every tool, in the side panel, the dashboard and on pages.</p>
			</div>

			<Preview />

			<div className="rounded-lg border border-line bg-surface px-5">
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

				<Field label="Accent" hint="Buttons, switches, focus and the selected tool.">
					<div role="radiogroup" aria-label="Accent" className="flex gap-2">
						{ACCENTS.map((a: Accent) => {
							const color = ACCENT_COLORS[a][mode];
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
									style={{ background: color }}
								>
									{selected && <Check size={16} color={mode === 'dark' ? ACCENT_COLORS[a].onDark : '#fff'} />}
								</button>
							);
						})}
					</div>
				</Field>

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
			</div>
		</section>
	);
}
