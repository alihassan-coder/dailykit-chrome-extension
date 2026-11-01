// Gives every screen the current settings and a way to change them. Changes made anywhere (dashboard, side
// panel, another window) arrive through the store subscription, so all open surfaces stay in sync.
import type { Settings, SettingsStore } from '@toolbelt/core';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, followSystemMode } from './theme.ts';

interface SettingsContextValue {
	settings: Settings;
	update: SettingsStore['update'];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
	store,
	themeTarget,
	children,
	fallback = null
}: {
	store: SettingsStore;
	/** Element that receives the theme tokens, usually document.documentElement. */
	themeTarget?: HTMLElement;
	children: ReactNode;
	fallback?: ReactNode;
}) {
	const [settings, setSettings] = useState<Settings | null>(null);

	useEffect(() => {
		let alive = true;
		store.get().then((s) => alive && setSettings(s));
		const stop = store.subscribe(setSettings);
		return () => {
			alive = false;
			stop();
		};
	}, [store]);

	useEffect(() => {
		if (!themeTarget || !settings) return;
		applyTheme(themeTarget, settings.theme);
		return followSystemMode(themeTarget, () => settings.theme);
	}, [themeTarget, settings]);

	if (!settings) return <>{fallback}</>;
	return <SettingsContext.Provider value={{ settings, update: store.update }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
	const value = useContext(SettingsContext);
	if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
	return value;
}
