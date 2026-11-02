// The models each provider offers for the user's key, fetched live (not hard-coded) and cached for a day.
import { anthropicAuthHeaders, isClaudeSetupToken, type ApiKeys, type ProviderId } from '@toolbelt/core';

export interface ModelInfo {
	provider: ProviderId;
	id: string;
	name: string;
	/** Input context size in tokens, when the provider says. */
	context?: number;
	/** Accepts images, when known. */
	vision?: boolean;
	/** Calls tools, when the provider list says it cannot (Gemma on Gemini). Unknown means yes. */
	tools?: boolean;
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
	],
	// Groq's production models (console.groq.com/docs/models); the live list replaces these once it loads.
	groq: [
		{ provider: 'groq', id: 'openai/gpt-oss-120b', name: 'GPT oss 120b', context: 131_072 },
		{ provider: 'groq', id: 'openai/gpt-oss-20b', name: 'GPT oss 20b', context: 131_072 },
		{ provider: 'groq', id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70b versatile', context: 131_072 },
		{ provider: 'groq', id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8b instant', context: 131_072 }
	]
};

/** Short, non-reversible tag of a key, so a cached list is dropped when the key changes. */
export function keyTag(key: string): string {
	let h = 0;
	for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
	return (h >>> 0).toString(36);
}

// OpenAI, xAI and Groq list every model they host; keep the ones that chat and call tools.
const NOT_CHAT =
	/(embed|tts|whisper|transcribe|dall-e|image|moderation|realtime|audio|search|babbage|davinci|computer-use|codex-mini)/i;
export const isChatModel = (id: string) => !NOT_CHAT.test(id);

// Groq also hosts speech models and safety classifiers (Llama Guard, Prompt Guard, gpt-oss-safeguard).
const GROQ_NOT_CHAT = /(whisper|playai|orpheus|tts|guard)/i;
/** Groq chat models that cannot take the agent's tools: Compound runs only its own built-in tools; ALLaM has none. */
const GROQ_NO_TOOLS = /(compound|allam)/i;
// Groq's vision models, by id: Llama 4 Scout and Maverick.
const GROQ_VISION = /llama-4-(scout|maverick)/i;

// Listed as chat models, but they cannot call tools (so they cannot run the browser agent).
const NO_TOOLS = /(gemma|learnlm|aqa|nano-banana|-image|imagen|veo|-tts|o1-mini|o1-preview)/i;
/** Whether a model can call tools. Computed from the id too, so lists cached before this was stored work. */
export const supportsTools = (m: ModelInfo) => m.tools ?? !NO_TOOLS.test(m.id);

/** "200K", "1M": a context size for the model picker. */
export function formatContext(tokens: number | undefined): string | null {
	if (!tokens || tokens <= 0) return null;
	if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
	return `${Math.round(tokens / 1000)}K`;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

// "gpt-5.5-mini" → "GPT-5.5 mini", "o3-pro" → "o3 pro": brand words keep their own casing.
const BRANDS: Record<string, string> = {
	gpt: 'GPT',
	chatgpt: 'ChatGPT',
	grok: 'Grok',
	gemini: 'Gemini',
	claude: 'Claude',
	llama: 'Llama',
	qwen: 'Qwen',
	qwen3: 'Qwen3',
	kimi: 'Kimi'
};
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
		throw new ModelsError('The provider rejected this API key.');
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
		if (isClaudeSetupToken(key))
			throw new ModelsError('Claude subscription tokens only work in Anthropic’s apps. Add an Anthropic API key.');
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
	} else if (provider === 'groq') {
		const body = (await getJson(
			'https://api.groq.com/openai/v1/models',
			{ Authorization: `Bearer ${key}` },
			fetchFn
		)) as {
			data?: Json[];
		};
		for (const m of body.data ?? []) {
			const id = String(m.id);
			if (m.active === false || !isChatModel(id) || GROQ_NOT_CHAT.test(id)) continue;
			out.push({
				provider,
				id,
				// "meta-llama/llama-4-scout-17b-16e-instruct" → "Llama 4 scout 17b 16e instruct".
				name: pretty(id.split('/').at(-1) ?? id),
				context: num(m.context_window),
				...(GROQ_VISION.test(id) ? { vision: true } : {}),
				...(GROQ_NO_TOOLS.test(id) ? { tools: false } : {})
			});
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
				if (!isChatModel(id)) continue;
				const gemma = /gemma/i.test(id);
				out.push({
					provider,
					id,
					name: String(m.displayName ?? id),
					context: num(m.inputTokenLimit),
					vision: /^gemini/i.test(id) ? true : undefined,
					...(gemma || NO_TOOLS.test(id) ? { tools: false } : {})
				});
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
	return (['anthropic', 'openai', 'xai', 'gemini', 'groq'] as ProviderId[])
		.filter((p) => keys[p])
		.flatMap((p) => (cache[p]?.key === keyTag(keys[p]!) ? cache[p]?.models : undefined) ?? FALLBACK[p] ?? []);
}

export function resolveCache(raw: unknown): ModelCache {
	return typeof raw === 'object' && raw !== null ? (raw as ModelCache) : {};
}
