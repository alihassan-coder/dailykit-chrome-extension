// Small fetch-based embedders and LLMs in the shape mem0 expects. mem0's built-in providers construct the
// OpenAI/Anthropic SDKs, which refuse to run in Firefox's background page; plain fetch works everywhere.
import type { ApiKeys, ProviderId } from '@toolbelt/core';
import type { Embedder, LLM, LLMResponse, Message } from 'mem0ai/oss';

/** Each answer must arrive well inside the 30 s a service worker may wait on one fetch. */
const TIMEOUT_MS = 25_000;

export interface EmbedderChoice {
	provider: 'openai' | 'gemini';
	model: string;
	dims: number;
	/** Recorded on every memory: "openai/text-embedding-3-small@512". */
	id: string;
}

export interface ExtractorChoice {
	provider: ProviderId;
	model: string;
}

const EMBEDDERS = {
	openai: { model: 'text-embedding-3-small', dims: 512 },
	gemini: { model: 'gemini-embedding-001', dims: 768 }
} as const;

/** OpenAI first, then Gemini. Anthropic and xAI offer no embedding API, so without one of these memory is off. */
export function chooseEmbedder(keys: ApiKeys): EmbedderChoice | null {
	const provider = keys.openai ? 'openai' : keys.gemini ? 'gemini' : null;
	if (!provider) return null;
	const { model, dims } = EMBEDDERS[provider];
	return { provider, model, dims, id: `${provider}/${model}@${dims}` };
}

/**
 * Fast, cheap models for picking what to remember, by provider, best first. Ids change often, so these are
 * matched against the provider's live list (the agent's model cache); the last entry is used when there is none.
 */
const CHEAP: Record<ProviderId, { prefer: RegExp[]; fallback: string }> = {
	anthropic: { prefer: [/haiku/], fallback: 'claude-haiku-5-5' },
	openai: { prefer: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+-nano$/, /^gpt-.*-mini$/], fallback: 'gpt-5-mini' },
	gemini: {
		prefer: [/^gemini-flash-lite-latest$/, /^gemini-[\d.]+-flash-lite$/, /^gemini-[\d.]+-flash$/],
		fallback: 'gemini-flash-lite-latest'
	},
	xai: { prefer: [/fast-non-reasoning/, /mini/], fallback: 'grok-4-fast-non-reasoning' }
};

const version = (id: string) => Number(id.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);

export function cheapestModel(provider: ProviderId, liveIds: string[] = []): string {
	const { prefer, fallback } = CHEAP[provider];
	// Dated snapshots and previews come and go; prefer stable aliases.
	const stable = liveIds.filter((id) => !/\d{4}-?\d{2}-?\d{2}|preview|exp|latest-|audio|image|tts|live/i.test(id));
	for (const list of [stable, liveIds]) {
		for (const pattern of prefer) {
			const hits = list.filter((id) => pattern.test(id)).sort((a, b) => version(b) - version(a));
			if (hits[0]) return hits[0];
		}
	}
	return fallback;
}

/** The agent's chosen provider when it has a key, otherwise the embedding provider (which always has one). */
export function chooseExtractor(
	keys: ApiKeys,
	agentChoice: ProviderId | null,
	embedder: EmbedderChoice,
	liveModels: Partial<Record<ProviderId, string[]>> = {}
): ExtractorChoice {
	const provider = agentChoice && keys[agentChoice] ? agentChoice : embedder.provider;
	return { provider, model: cheapestModel(provider, liveModels[provider]) };
}

type Fetch = typeof fetch;

async function post(fetchFn: Fetch, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
	const res = await fetchFn(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) {
		const detail = res.status === 401 || res.status === 403 ? 'the API key was rejected' : `status ${res.status}`;
		throw new Error(`The AI provider answered with ${detail}.`);
	}
	return res.json();
}

const normalize = (v: number[]) => {
	const n = Math.hypot(...v) || 1;
	return v.map((x) => x / n);
};

export function createEmbedder(choice: EmbedderChoice, apiKey: string, fetchFn: Fetch = fetch): Embedder {
	async function embedBatch(texts: string[], action?: 'add' | 'update' | 'search'): Promise<number[][]> {
		if (!texts.length) return [];
		if (choice.provider === 'openai') {
			const body = (await post(
				fetchFn,
				'https://api.openai.com/v1/embeddings',
				{ authorization: `Bearer ${apiKey}` },
				{ model: choice.model, input: texts, dimensions: choice.dims }
			)) as { data: { index: number; embedding: number[] }[] };
			return [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
		}
		// Gemini: shortened outputs are not unit length, so normalise them (docs: ai.google.dev embeddings).
		const taskType = action === 'search' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
		const body = (await post(
			fetchFn,
			`https://generativelanguage.googleapis.com/v1beta/models/${choice.model}:batchEmbedContents`,
			{ 'x-goog-api-key': apiKey },
			{
				requests: texts.map((text) => ({
					model: `models/${choice.model}`,
					content: { parts: [{ text }] },
					taskType,
					outputDimensionality: choice.dims
				}))
			}
		)) as { embeddings: { values: number[] }[] };
		return body.embeddings.map((e) => normalize(e.values));
	}
	return {
		embed: async (text, action) => (await embedBatch([text], action))[0]!,
		embedBatch
	};
}

const asText = (content: Message['content']) => (typeof content === 'string' ? content : JSON.stringify(content));

export function createLlm(choice: ExtractorChoice, apiKey: string, fetchFn: Fetch = fetch): LLM {
	async function complete(messages: Message[], json: boolean): Promise<string> {
		const system = messages
			.filter((m) => m.role === 'system')
			.map((m) => asText(m.content))
			.join('\n\n');
		const turns = messages.filter((m) => m.role !== 'system');

		if (choice.provider === 'openai' || choice.provider === 'xai') {
			const base = choice.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.x.ai/v1';
			const body = (await post(
				fetchFn,
				`${base}/chat/completions`,
				{ authorization: `Bearer ${apiKey}` },
				{
					model: choice.model,
					messages: messages.map((m) => ({ role: m.role, content: asText(m.content) })),
					...(json ? { response_format: { type: 'json_object' } } : {})
				}
			)) as { choices: { message: { content: string | null } }[] };
			return body.choices[0]?.message.content ?? '';
		}

		if (choice.provider === 'anthropic') {
			// No JSON mode; mem0 pulls the JSON out of the reply (fenced or not).
			const body = (await post(
				fetchFn,
				'https://api.anthropic.com/v1/messages',
				{
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				},
				{
					model: choice.model,
					max_tokens: 2048,
					...(system ? { system } : {}),
					messages: turns.map((m) => ({
						role: m.role === 'assistant' ? 'assistant' : 'user',
						content: asText(m.content)
					}))
				}
			)) as { content: { type: string; text?: string }[] };
			return body.content
				.filter((c) => c.type === 'text')
				.map((c) => c.text ?? '')
				.join('');
		}

		const body = (await post(
			fetchFn,
			`https://generativelanguage.googleapis.com/v1beta/models/${choice.model}:generateContent`,
			{ 'x-goog-api-key': apiKey },
			{
				...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
				contents: turns.map((m) => ({
					role: m.role === 'assistant' ? 'model' : 'user',
					parts: [{ text: asText(m.content) }]
				})),
				...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {})
			}
		)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
		return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
	}

	return {
		generateResponse: (messages, format) => complete(messages, format?.type === 'json_object'),
		generateChat: async (messages): Promise<LLMResponse> => ({
			content: await complete(messages, false),
			role: 'assistant'
		})
	};
}
