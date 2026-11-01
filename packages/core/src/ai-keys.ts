// The AI providers Toolbelt can use with the user's own API keys, and how their keys are stored.
// Keys stay on this device (storage.local) unless the user turns on encrypted sync.

export const PROVIDERS = [
	{
		id: 'anthropic',
		name: 'Anthropic',
		product: 'Claude',
		keyHint: 'sk-ant-',
		consoleUrl: 'https://console.anthropic.com/settings/keys'
	},
	{ id: 'openai', name: 'OpenAI', product: 'GPT', keyHint: 'sk-', consoleUrl: 'https://platform.openai.com/api-keys' },
	{ id: 'xai', name: 'xAI', product: 'Grok', keyHint: 'xai-', consoleUrl: 'https://console.x.ai' },
	{ id: 'gemini', name: 'Google', product: 'Gemini', keyHint: 'AIza', consoleUrl: 'https://aistudio.google.com/apikey' }
] as const;

export type ProviderId = (typeof PROVIDERS)[number]['id'];
export type ApiKeys = Partial<Record<ProviderId, string>>;

/** Setup tokens share the existing credential slot; old API-key settings need no migration. */
export const isClaudeSetupToken = (value: string): boolean => value.trim().startsWith('sk-ant-oat01-');

export const looksLikeClaudeSetupToken = (value: string): boolean =>
	/^sk-ant-oat01-[A-Za-z0-9_-]+$/.test(value.trim()) && value.trim().length >= 80;

const IDS = PROVIDERS.map((p) => p.id) as readonly string[];

export function resolveApiKeys(raw: unknown): ApiKeys {
	if (typeof raw !== 'object' || raw === null) return {};
	const keys: ApiKeys = {};
	for (const [id, value] of Object.entries(raw)) {
		if (IDS.includes(id) && typeof value === 'string' && value.trim()) keys[id as ProviderId] = value.trim();
	}
	return keys;
}

/** "sk-ant-api03-abc…wxyz" style preview, so a saved key can be recognised without being shown. */
export function maskKey(key: string): string {
	if (key.length <= 12) return '•'.repeat(key.length);
	return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/** A gentle check, not validation: providers change formats, so a mismatch only warns. */
export function looksLikeKey(provider: ProviderId, key: string): boolean {
	const hint = PROVIDERS.find((p) => p.id === provider)?.keyHint ?? '';
	return key.trim().startsWith(hint) && key.trim().length >= 20;
}
