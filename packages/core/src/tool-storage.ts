// A tool's own saved data (color history, site lists, ...), one value per key, stored as `tb:<tool>:<key>`.
// `resolve` turns whatever is saved (or nothing) into a valid value, so callers never handle bad data.
import type { SettingsArea } from './settings.ts';

export interface ToolValue<T> {
	get(): Promise<T>;
	set(value: T): Promise<void>;
	update(change: (current: T) => T): Promise<T>;
	subscribe(listener: (value: T) => void): () => void;
}

export function toolValue<T>(
	area: SettingsArea,
	toolId: string,
	key: string,
	resolve: (raw: unknown) => T
): ToolValue<T> {
	const storageKey = `tb:${toolId}:${key}`;
	const get = async () => resolve((await area.get(storageKey))[storageKey]);
	let queue: Promise<unknown> = Promise.resolve();

	return {
		get,
		set: (value) => area.set({ [storageKey]: value }),
		update(change) {
			const next = queue.then(async () => {
				const value = change(await get());
				await area.set({ [storageKey]: value });
				return value;
			});
			queue = next.catch(() => {});
			return next;
		},
		subscribe(listener) {
			const onChange: Parameters<SettingsArea['onChanged']['addListener']>[0] = (changes) => {
				if (storageKey in changes) listener(resolve(changes[storageKey]?.newValue));
			};
			area.onChanged.addListener(onChange);
			return () => area.onChanged.removeListener(onChange);
		}
	};
}
