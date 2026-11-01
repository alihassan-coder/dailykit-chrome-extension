// User settings shared by every surface (background, side panel, dashboard, in-page UI): which tools and
// features are on, the tool order, and the theme. Stored as one object in storage.local; every surface
// reads it through resolveSettings, so a missing or old value always comes back complete and valid.

export const SETTINGS_KEY = 'tb:settings';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';
export type Corners = 'sharp' | 'soft' | 'round';
export const ACCENTS = ['cobalt', 'moss', 'plum', 'copper', 'graphite'] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Theme {
	mode: ThemeMode;
	accent: Accent;
	density: Density;
	corners: Corners;
}

export interface ToolSettings {
	enabled: boolean;
	features: Record<string, boolean>;
}

export interface Settings {
	version: 1;
	tools: Record<string, ToolSettings>;
	order: string[];
	theme: Theme;
}

/** What settings need to know about a tool. Matches both the descriptor and the runtime registry. */
export interface ToolInfo {
	id: string;
	features: { id: string; defaultOn: boolean }[];
}

export const DEFAULT_THEME: Theme = { mode: 'system', accent: 'cobalt', density: 'comfortable', corners: 'soft' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.includes(value as T) ? (value as T) : fallback;

function resolveTheme(raw: unknown): Theme {
	const t = isObject(raw) ? raw : {};
	return {
		mode: oneOf(t.mode, ['system', 'light', 'dark'], DEFAULT_THEME.mode),
		accent: oneOf(t.accent, ACCENTS, DEFAULT_THEME.accent),
		density: oneOf(t.density, ['compact', 'comfortable'], DEFAULT_THEME.density),
		corners: oneOf(t.corners, ['sharp', 'soft', 'round'], DEFAULT_THEME.corners)
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

	return { version: 1, tools: resolved, order: [...new Set(order)], theme: resolveTheme(saved.theme) };
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
