// Fake AI providers for tests: embeddings that share words land close together, and an "LLM" that remembers
// each thing the user said. Every request is logged, so tests can check where traffic went.
import type { KeyValue } from '@toolbelt/db';

function embed(text: string, dims: number): number[] {
	const v = new Array<number>(dims).fill(0);
	for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
		let h = 7;
		for (const ch of word) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
		v[h % dims]! += 1;
	}
	v[dims - 1]! += 0.01; // never all zeros
	return v;
}

/** What the fake LLM extracts: every "user: …" line of the new messages. */
function extract(prompt: string): string {
	const section = prompt.split('## New Messages')[1]?.split('## Observation Date')[0] ?? '';
	const facts = [...section.matchAll(/^user: (.+)$/gm)].map((m, i) => ({ id: String(i), text: m[1]!.trim() }));
	return JSON.stringify({ memory: facts });
}

export function fakeProviders() {
	const calls: { url: string; body: unknown }[] = [];
	let offline = false;
	const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ url, body });
		if (offline) throw new TypeError('Failed to fetch');
		const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
		if (url === 'https://api.openai.com/v1/embeddings') {
			const b = body as { input: string[]; dimensions: number };
			return json({ data: b.input.map((t, index) => ({ index, embedding: embed(t, b.dimensions) })) });
		}
		if (url.endsWith(':batchEmbedContents')) {
			const b = body as { requests: { content: { parts: { text: string }[] }; outputDimensionality: number }[] };
			return json({
				embeddings: b.requests.map((r) => ({ values: embed(r.content.parts[0]!.text, r.outputDimensionality) }))
			});
		}
		if (url === 'https://api.openai.com/v1/chat/completions') {
			const b = body as { messages: { role: string; content: string }[] };
			const prompt = b.messages.find((m) => m.role === 'user')!.content;
			return json({ choices: [{ message: { content: extract(prompt) } }] });
		}
		if (url.endsWith(':generateContent')) {
			const b = body as { contents: { parts: { text: string }[] }[] };
			return json({ candidates: [{ content: { parts: [{ text: extract(b.contents[0]!.parts[0]!.text) }] } }] });
		}
		return new Response('not found', { status: 404 });
	}) as typeof fetch;
	return {
		fetch: fetchFn,
		calls,
		setOffline: (v: boolean) => void (offline = v)
	};
}

export function memoryArea(): KeyValue & { data: Record<string, unknown> } {
	const data: Record<string, unknown> = {};
	return {
		data,
		get: async (keys) => {
			if (keys == null) return { ...data };
			const list = typeof keys === 'string' ? [keys] : keys;
			return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
		},
		set: async (items) => void Object.assign(data, structuredClone(items)),
		remove: async (keys) => {
			for (const k of typeof keys === 'string' ? [keys] : keys) delete data[k];
		}
	};
}
