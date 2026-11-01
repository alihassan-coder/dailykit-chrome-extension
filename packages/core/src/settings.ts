// User settings shared by every surface (background, side panel, dashboard, in-page UI): which tools and
// features are on, the tool order, and the theme. Stored as one object in storage.local; every surface
// reads it through resolveSettings, so a missing or old value always comes back complete and valid.

export const SETTINGS_KEY = 'tb:settings';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';
export type Corners = 'sharp' | 'soft' | 'round';
export const ACCENTS = ['cobalt', 'moss', 'plum', 'copper', 'graphite'] as const;
export type AccentPreset = (typeof ACCENTS)[number];
/** A preset name, or any colour the user picked as "#rrggbb". */
export type Accent = AccentPreset | `#${string}`;
export type TextSize = 'small' | 'default' | 'large' | 'larger';
export type FontChoice = 'toolbelt' | 'system';
export type Contrast = 'standard' | 'high';
export type Motion = 'full' | 'reduced';
export type RailStyle = 'icons' | 'labels';

export interface Theme {
	mode: ThemeMode;
	accent: Accent;
	density: Density;
	corners: Corners;
	textSize: TextSize;
	font: FontChoice;
	contrast: Contrast;
	motion: Motion;
	rail: RailStyle;
}

export interface ToolSettings {
	enabled: boolean;
	features: Record<string, boolean>;
}

export interface General {
	/** What the side panel opens with: the last tool used, or one chosen tool. */
	startTool: 'last' | string;
}

export interface Settings {
	version: 1;
	tools: Record<string, ToolSettings>;
	order: string[];
	theme: Theme;
	general: General;
}

/** What settings need to know about a tool. Matches both the descriptor and the runtime registry. */
export interface ToolInfo {
	id: string;
	features: { id: string; defaultOn: boolean }[];
}

export const DEFAULT_THEME: Theme = {
	mode: 'system',
	accent: 'cobalt',
	density: 'comfortable',
	corners: 'soft',
	textSize: 'default',
	font: 'toolbelt',
	contrast: 'standard',
	motion: 'full',
	rail: 'icons'
};

const HEX = /^#[0-9a-f]{6}$/;
const resolveAccent = (v: unknown): Accent =>
	typeof v === 'string' && (ACCENTS.includes(v as AccentPreset) || HEX.test(v)) ? (v as Accent) : DEFAULT_THEME.accent;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.includes(value as T) ? (value as T) : fallback;

function resolveTheme(raw: unknown): Theme {
	const t = isObject(raw) ? raw : {};
	return {
		mode: oneOf(t.mode, ['system', 'light', 'dark'], DEFAULT_THEME.mode),
		accent: resolveAccent(t.accent),
		density: oneOf(t.density, ['compact', 'comfortable'], DEFAULT_THEME.density),
		corners: oneOf(t.corners, ['sharp', 'soft', 'round'], DEFAULT_THEME.corners),
		textSize: oneOf(t.textSize, ['small', 'default', 'large', 'larger'], DEFAULT_THEME.textSize),
		font: oneOf(t.font, ['toolbelt', 'system'], DEFAULT_THEME.font),
		contrast: oneOf(t.contrast, ['standard', 'high'], DEFAULT_THEME.contrast),
		motion: oneOf(t.motion, ['full', 'reduced'], DEFAULT_THEME.motion),
		rail: oneOf(t.rail, ['icons', 'labels'], DEFAULT_THEME.rail)
	};
}

/** Saved value (any shape, or nothing) + the tools this build has -> complete, valid settings. */
export function resolveSettings(raw: unknown, tools: ToolInfo[]): Settings {
	const saved = isObject(raw) ? raw : {};
	const savedTools = isObject(saved.tools) ? saved.tools : {};

	const resolved: Record<string, ToolSettings> = {};
	for (const tool of tools) {
		const s = isObject(savedTools[tool.id]) ? (savedTools[tool.id] as Record<string, unknown>) : {};
		const savedFeatures = isObject(s.features) ? s.features : {};
		const features: Record<string, boolean> = {};
		for (const f of tool.features) {
			features[f.id] = typeof savedFeatures[f.id] === 'boolean' ? (savedFeatures[f.id] as boolean) : f.defaultOn;
		}
		resolved[tool.id] = { enabled: typeof s.enabled === 'boolean' ? s.enabled : true, features };
	}

	const known = new Set(tools.map((t) => t.id));
	const savedOrder = Array.isArray(saved.order) ? saved.order : [];
	const order = savedOrder.filter((id): id is string => typeof id === 'string' && known.has(id));
	for (const t of tools) if (!order.includes(t.id)) order.push(t.id);

	const general = isObject(saved.general) ? saved.general : {};
	const startTool = typeof general.startTool === 'string' && known.has(general.startTool) ? general.startTool : 'last';

	return {
		version: 1,
		tools: resolved,
		order: [...new Set(order)],
		theme: resolveTheme(saved.theme),
		general: { startTool }
	};
}

export function setToolEnabled(s: Settings, toolId: string, enabled: boolean): Settings {
	const tool = s.tools[toolId];
	if (!tool) return s;
	return { ...s, tools: { ...s.tools, [toolId]: { ...tool, enabled } } };
}

export function setFeature(s: Settings, toolId: string, featureId: string, on: boolean): Settings {
	const tool = s.tools[toolId];
	if (!tool) return s;
	return { ...s, tools: { ...s.tools, [toolId]: { ...tool, features: { ...tool.features, [featureId]: on } } } };
}

/** A feature counts as on only when its tool is on too. */
export function featureOn(s: Settings, toolId: string, featureId: string): boolean {
	const tool = s.tools[toolId];
	return !!tool?.enabled && !!tool.features[featureId];
}

export function moveTool(s: Settings, toolId: string, toIndex: number): Settings {
	const from = s.order.indexOf(toolId);
	if (from < 0) return s;
	const order = s.order.filter((id) => id !== toolId);
	order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, toolId);
	return { ...s, order };
}

export function setTheme(s: Settings, patch: Partial<Theme>): Settings {
	return { ...s, theme: resolveTheme({ ...s.theme, ...patch }) };
}

export function setGeneral(s: Settings, patch: Partial<General>): Settings {
	return { ...s, general: { ...s.general, ...patch } };
}

export function orderedTools<T extends { id: string }>(s: Settings, tools: T[]): T[] {
	const rank = new Map(s.order.map((id, i) => [id, i]));
	return [...tools].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

export const enabledToolIds = (s: Settings) => s.order.filter((id) => s.tools[id]?.enabled);

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;

/** The slice of `browser.storage.local` the store needs, so tests can pass a fake. */
export interface SettingsArea {
	get(key: string): Promise<Record<string, unknown>>;
	set(items: Record<string, unknown>): Promise<void>;
	onChanged: { addListener(l: ChangeListener): void; removeListener(l: ChangeListener): void };
}

export interface SettingsStore {
	get(): Promise<Settings>;
	update(change: (s: Settings) => Settings): Promise<Settings>;
	/** Called with fresh settings whenever they change, from this surface or any other. */
	subscribe(listener: (s: Settings) => void): () => void;
}

export function createSettingsStore(area: SettingsArea, tools: ToolInfo[]): SettingsStore {
	const read = async () => resolveSettings((await area.get(SETTINGS_KEY))[SETTINGS_KEY], tools);
	// Updates are queued: two quick clicks must each see the other's result, not the same old value.
	let queue: Promise<unknown> = Promise.resolve();

	return {
		get: read,
		update(change) {
			const next = queue.then(async () => {
				const updated = change(await read());
				await area.set({ [SETTINGS_KEY]: updated });
				return updated;
			});
			queue = next.catch(() => {});
			return next;
		},
		subscribe(listener) {
			const onChange: ChangeListener = (changes) => {
				if (SETTINGS_KEY in changes) listener(resolveSettings(changes[SETTINGS_KEY]?.newValue, tools));
			};
			area.onChanged.addListener(onChange);
			return () => area.onChanged.removeListener(onChange);
		}
	};
}
