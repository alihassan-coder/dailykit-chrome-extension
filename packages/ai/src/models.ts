// The models each provider offers for the user's key, fetched live (not hard-coded) and cached for a day.
import { anthropicAuthHeaders, type ApiKeys, type ProviderId } from '@toolbelt/core';

export interface ModelInfo {
	provider: ProviderId;
	id: string;
	name: string;
}

export interface ModelCache {
	/** Per provider: the list, when it was fetched, and which key it was fetched with (a fingerprint, never the key). */
	[provider: string]: { models: ModelInfo[]; fetchedAt: number; key: string } | undefined;
}

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Verified ids, used only when the live list cannot be loaded and nothing is cached. */
export const FALLBACK: Partial<Record<ProviderId, ModelInfo[]>> = {
	anthropic: [
		{ provider: 'anthropic', id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
		{ provider: 'anthropic', id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
		{ provider: 'anthropic', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }
	]
};

/** Short, non-reversible tag of a key, so a cached list is dropped when the key changes. */
export function keyTag(key: string): string {
	let h = 0;
	for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
	return (h >>> 0).toString(36);
}

// OpenAI and xAI list every model they host; keep the ones that chat and call tools.
const NOT_CHAT =
	/(embed|tts|whisper|transcribe|dall-e|image|moderation|realtime|audio|search|babbage|davinci|computer-use|codex-mini)/i;
export const isChatModel = (id: string) => !NOT_CHAT.test(id);

// "gpt-5.5-mini" → "GPT-5.5 mini", "o3-pro" → "o3 pro": brand words keep their own casing.
const BRANDS: Record<string, string> = { gpt: 'GPT', chatgpt: 'ChatGPT', grok: 'Grok', gemini: 'Gemini', claude: 'Claude' };
export const pretty = (id: string) => {
	const words = id.split(/[-_ ]+/).filter(Boolean);
	const out: string[] = [];
	for (const w of words) {
		const brand = BRANDS[w.toLowerCase()];
		const prev = out.at(-1);
		// A version right after GPT joins with a hyphen: GPT-5.5, GPT-4o.
		if (prev === 'GPT' && /^\d/.test(w)) out[out.length - 1] = `GPT-${w}`;
		else out.push(brand ?? w.toLowerCase());
	}
	return out.join(' ');
};

export class ModelsError extends Error {}

async function getJson(url: string, headers: Record<string, string>, fetchFn: typeof fetch): Promise<unknown> {
	let res: Response;
	try {
		res = await fetchFn(url, { headers, signal: AbortSignal.timeout(15_000) });
	} catch {
		throw new ModelsError('You seem to be offline.');
	}
	if (res.status === 401 || res.status === 403) {
		throw new ModelsError(
			headers.Authorization?.startsWith('Bearer sk-ant-oat01-')
				? 'Claude rejected this setup token. Run claude setup-token again and replace it in AI providers.'
				: 'The provider rejected this API key.'
		);
	}
	if (res.status === 429) throw new ModelsError('Too many requests; try again in a minute.');
	if (!res.ok) throw new ModelsError(`The provider answered ${res.status}.`);
	return res.json();
}

type Json = Record<string, unknown>;

export async function fetchModels(
	provider: ProviderId,
	key: string,
	fetchFn: typeof fetch = fetch
): Promise<ModelInfo[]> {
	const out: ModelInfo[] = [];
	if (provider === 'anthropic') {
		let after = '';
		for (;;) {
			const body = (await getJson(
				`https://api.anthropic.com/v1/models?limit=100${after ? `&after_id=${after}` : ''}`,
				anthropicAuthHeaders(key),
				fetchFn
			)) as { data?: Json[]; has_more?: boolean; last_id?: string };
			for (const m of body.data ?? []) out.push({ provider, id: String(m.id), name: String(m.display_name ?? m.id) });
			if (!body.has_more || !body.last_id) break;
			after = body.last_id;
		}
	} else if (provider === 'openai' || provider === 'xai') {
		const base = provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.x.ai/v1';
		const body = (await getJson(`${base}/models`, { Authorization: `Bearer ${key}` }, fetchFn)) as { data?: Json[] };
		for (const m of body.data ?? []) {
			const id = String(m.id);
			if (isChatModel(id)) out.push({ provider, id, name: pretty(id) });
		}
		out.sort((a, b) => b.id.localeCompare(a.id));
	} else {
		let page = '';
		for (;;) {
			const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${page}` : ''}`;
			const body = (await getJson(url, { 'x-goog-api-key': key }, fetchFn)) as {
				models?: Json[];
				nextPageToken?: string;
			};
			for (const m of body.models ?? []) {
				const methods = (m.supportedGenerationMethods as string[] | undefined) ?? [];
				if (!methods.includes('generateContent')) continue;
				const id = String(m.name).replace(/^models\//, '');
				if (isChatModel(id)) out.push({ provider, id, name: String(m.displayName ?? id) });
			}
			if (!body.nextPageToken) break;
			page = body.nextPageToken;
		}
	}
	return out;
}

/** Which providers need a fresh list: new key, no list, or older than a day. */
export function stale(cache: ModelCache, keys: ApiKeys, now = Date.now()): ProviderId[] {
	return (Object.keys(keys) as ProviderId[]).filter((p) => {
		const entry = cache[p];
		const key = keys[p];
		return key && (!entry || entry.key !== keyTag(key) || now - entry.fetchedAt > MAX_AGE_MS);
	});
}

/** Refreshes what is stale. A failure keeps the old list and reports the problem. */
export async function refresh(
	cache: ModelCache,
	keys: ApiKeys,
	opts: { force?: boolean; now?: number; fetchFn?: typeof fetch } = {}
): Promise<{ cache: ModelCache; errors: Partial<Record<ProviderId, string>> }> {
	const now = opts.now ?? Date.now();
	const due = opts.force ? (Object.keys(keys) as ProviderId[]).filter((p) => keys[p]) : stale(cache, keys, now);
	const next: ModelCache = {};
	for (const p of Object.keys(keys) as ProviderId[]) if (cache[p]?.key === keyTag(keys[p]!)) next[p] = cache[p];
	const errors: Partial<Record<ProviderId, string>> = {};
	await Promise.all(
		due.map(async (p) => {
			try {
				next[p] = { models: await fetchModels(p, keys[p]!, opts.fetchFn), fetchedAt: now, key: keyTag(keys[p]!) };
			} catch (e) {
				errors[p] = e instanceof Error ? e.message : String(e);
			}
		})
	);
	return { cache: next, errors };
}

/** Models to offer: live lists, or the verified fallback for a provider that has none yet. */
export function available(cache: ModelCache, keys: ApiKeys): ModelInfo[] {
	return (['anthropic', 'openai', 'xai', 'gemini'] as ProviderId[])
		.filter((p) => keys[p])
		.flatMap((p) => (cache[p]?.key === keyTag(keys[p]!) ? cache[p]?.models : undefined) ?? FALLBACK[p] ?? []);
}

export function resolveCache(raw: unknown): ModelCache {
	return typeof raw === 'object' && raw !== null ? (raw as ModelCache) : {};
}
