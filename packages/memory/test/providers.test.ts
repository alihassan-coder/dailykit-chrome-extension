import { describe, expect, it } from 'vitest';
import { cheapestModel, chooseEmbedder, chooseExtractor, createEmbedder, createLlm } from '../src/providers.ts';
import { bm25, cosine, matchesFilters, packVector, unpackVector } from '../src/vectors.ts';

function recorder(reply: unknown) {
	const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
	const fetchFn = (async (url: string, init: RequestInit) => {
		calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
		return new Response(JSON.stringify(reply));
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
}

describe('choosing models', () => {
	it('needs OpenAI or Gemini for embeddings', () => {
		expect(chooseEmbedder({ anthropic: 'k', xai: 'k', groq: 'k' })).toBeNull();
		expect(chooseEmbedder({ gemini: 'k' })?.id).toBe('gemini/gemini-embedding-001@768');
		expect(chooseEmbedder({ gemini: 'k', openai: 'k' })?.id).toBe('openai/text-embedding-3-small@512');
	});

	it('picks a fast, cheap model from the live list, with a fallback', () => {
		expect(cheapestModel('anthropic', ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5-20251001'])).toBe(
			'claude-haiku-5-5'
		);
		expect(cheapestModel('openai', ['gpt-5.5', 'gpt-5-mini', 'gpt-5.5-mini', 'gpt-5.5-nano'])).toBe('gpt-5.5-mini');
		expect(cheapestModel('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])).toBe(
			'gemini-2.5-flash-lite'
		);
		expect(cheapestModel('xai', [])).toBe('grok-4-fast-non-reasoning');
		expect(cheapestModel('groq', ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])).toBe(
			'llama-3.1-8b-instant'
		);
		expect(cheapestModel('groq', [])).toBe('openai/gpt-oss-20b');
		expect(cheapestModel('anthropic')).toBe('claude-haiku-5-5');
	});

	it("uses the agent's provider when it has a key, else the embedding one", () => {
		const embedder = chooseEmbedder({ openai: 'k' })!;
		expect(chooseExtractor({ openai: 'k', anthropic: 'k' }, 'anthropic', embedder).provider).toBe('anthropic');
		expect(chooseExtractor({ openai: 'k' }, 'anthropic', embedder).provider).toBe('openai');
	});
});

describe('provider adapters', () => {
	it('refuses a Claude subscription token without sending it', async () => {
		const token = `sk-ant-oat01-${'x'.repeat(90)}`;
		const { calls, fetchFn } = recorder({ content: [{ type: 'text', text: '{}' }] });
		const llm = createLlm({ provider: 'anthropic', model: 'claude-haiku-5-5' }, token, fetchFn);
		await expect(llm.generateChat([{ role: 'user', content: 'Hi' }])).rejects.toThrow(/Anthropic API key/);
		expect(calls).toHaveLength(0);
	});
	it('embeds with Gemini in one batch, shortened and normalised', async () => {
		const { calls, fetchFn } = recorder({ embeddings: [{ values: [3, 4] }, { values: [0, 2] }] });
		const embedder = createEmbedder(chooseEmbedder({ gemini: 'AIza-key' })!, 'AIza-key', fetchFn);
		expect(await embedder.embedBatch(['a', 'b'], 'search')).toEqual([
			[0.6, 0.8],
			[0, 1]
		]);
		expect(calls[0]!.url).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents'
		);
		expect(calls[0]!.headers['x-goog-api-key']).toBe('AIza-key');
		expect(calls[0]!.body.requests).toEqual([
			expect.objectContaining({ taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }),
			expect.anything()
		]);
	});

	it('asks Claude with the system prompt apart and the browser header', async () => {
		const { calls, fetchFn } = recorder({ content: [{ type: 'text', text: '{"memory":[]}' }] });
		const llm = createLlm({ provider: 'anthropic', model: 'claude-haiku-5-5' }, 'sk-ant-key', fetchFn);
		const reply = await llm.generateResponse(
			[
				{ role: 'system', content: 'Extract facts' },
				{ role: 'user', content: 'Hi' }
			],
			{ type: 'json_object' }
		);
		expect(reply).toBe('{"memory":[]}');
		expect(calls[0]!.headers).toMatchObject({
			'x-api-key': 'sk-ant-key',
			'anthropic-dangerous-direct-browser-access': 'true'
		});
		expect(calls[0]!.body).toMatchObject({ system: 'Extract facts', messages: [{ role: 'user', content: 'Hi' }] });
	});

	it('asks Gemini for JSON with a system instruction', async () => {
		const { calls, fetchFn } = recorder({ candidates: [{ content: { parts: [{ text: '{}' }] } }] });
		const llm = createLlm({ provider: 'gemini', model: 'gemini-flash-lite-latest' }, 'AIza', fetchFn);
		await llm.generateResponse(
			[
				{ role: 'system', content: 'S' },
				{ role: 'user', content: 'U' }
			],
			{ type: 'json_object' }
		);
		expect(calls[0]!.body).toEqual({
			systemInstruction: { parts: [{ text: 'S' }] },
			contents: [{ role: 'user', parts: [{ text: 'U' }] }],
			generationConfig: { responseMimeType: 'application/json' }
		});
	});

	it('extracts with Groq through its OpenAI-compatible endpoint', async () => {
		const { calls, fetchFn } = recorder({ choices: [{ message: { content: '{"facts":[]}' } }] });
		const llm = createLlm({ provider: 'groq', model: 'openai/gpt-oss-20b' }, 'gsk_key', fetchFn);
		expect(await llm.generateResponse([{ role: 'user', content: 'Hi' }], { type: 'json_object' })).toBe('{"facts":[]}');
		expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
		expect(calls[0]!.headers.authorization).toBe('Bearer gsk_key');
		expect(calls[0]!.body).toMatchObject({ model: 'openai/gpt-oss-20b', response_format: { type: 'json_object' } });
	});

	it('reports a rejected key plainly', async () => {
		const fetchFn = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch;
		const llm = createLlm({ provider: 'xai', model: 'grok' }, 'xai-key', fetchFn);
		await expect(llm.generateChat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/key was rejected/);
	});
});

describe('local search', () => {
	it('packs vectors without losing float32 precision', () => {
		const v = [0.1, -2.5, 3e-7, 42];
		expect(Array.from(unpackVector(packVector(v)))).toEqual(Array.from(Float32Array.from(v)));
	});

	it('scores by cosine similarity', () => {
		expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
		expect(cosine([0, 0], [1, 1])).toBe(0);
	});

	it("understands mem0's filters", () => {
		const p = { user_id: 'u1', topic: 'food', n: 3 };
		expect(matchesFilters(p, { user_id: 'u1' })).toBe(true);
		expect(matchesFilters(p, { user_id: 'u2' })).toBe(false);
		expect(matchesFilters(p, { user_id: '*', n: { gte: 3 } })).toBe(true);
		expect(matchesFilters(p, { OR: [{ topic: 'travel' }, { topic: 'food' }] })).toBe(true);
		expect(matchesFilters(p, { NOT: [{ topic: 'food' }] })).toBe(false);
		expect(matchesFilters(p, { topic: { in: ['a', 'b'] } })).toBe(false);
	});

	it('ranks keyword matches with BM25', () => {
		const docs = ['user likes green tea', 'user drives a car', 'tea tea tea'].map((text) => ({ item: text, text }));
		expect(bm25('green tea', docs).map((r) => r.item)).toEqual(['user likes green tea', 'tea tea tea']);
		expect(bm25('', docs)).toEqual([]);
	});
});
