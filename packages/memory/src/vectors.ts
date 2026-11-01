// The maths behind local search: cosine similarity, mem0's filter syntax, a small BM25, and a compact way to
// store a vector inside an encrypted record.

/** Float32 bytes as base64: about a third of the size of a JSON number list. */
export function packVector(vector: ArrayLike<number>): string {
	const bytes = new Uint8Array(Float32Array.from(vector).buffer);
	let text = '';
	for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(text);
}

export function unpackVector(packed: string): Float32Array {
	const bytes = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
	return new Float32Array(bytes.buffer);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i]!;
		const y = b[i]!;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

type Payload = Record<string, unknown>;
type Filters = Record<string, unknown>;

// The same operators mem0's own local store understands (eq, ne, gt, in, contains, AND/OR/NOT, '*').
function fieldMatches(value: unknown, condition: unknown): boolean {
	if (typeof condition !== 'object' || condition === null) return condition === '*' || value === condition;
	if (Array.isArray(condition)) return condition.includes(value);
	const c = condition as Record<string, unknown>;
	if ('eq' in c) return value === c.eq;
	if ('ne' in c) return value !== c.ne;
	if ('gt' in c) return (value as number) > (c.gt as number);
	if ('gte' in c) return (value as number) >= (c.gte as number);
	if ('lt' in c) return (value as number) < (c.lt as number);
	if ('lte' in c) return (value as number) <= (c.lte as number);
	if ('in' in c) return Array.isArray(c.in) && c.in.includes(value);
	if ('nin' in c) return !Array.isArray(c.nin) || !c.nin.includes(value);
	if ('contains' in c) return typeof value === 'string' && value.includes(String(c.contains));
	if ('icontains' in c)
		return typeof value === 'string' && value.toLowerCase().includes(String(c.icontains).toLowerCase());
	return value === condition;
}

export function matchesFilters(payload: Payload, filters?: Filters): boolean {
	if (!filters) return true;
	for (const [rawKey, condition] of Object.entries(filters)) {
		const key = ({ $and: 'AND', $or: 'OR', $not: 'NOT' } as Record<string, string>)[rawKey] ?? rawKey;
		const subs = Array.isArray(condition) ? (condition as Filters[]) : [];
		if (key === 'AND' && !subs.every((f) => matchesFilters(payload, f))) return false;
		else if (key === 'OR' && !subs.some((f) => matchesFilters(payload, f))) return false;
		else if (key === 'NOT' && subs.some((f) => matchesFilters(payload, f))) return false;
		else if (!['AND', 'OR', 'NOT'].includes(key) && !fieldMatches(payload[key], condition)) return false;
	}
	return true;
}

const tokens = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/** Okapi BM25 over each document's text (k1 1.5, b 0.75, like mem0's local store). Only positive scores. */
export function bm25<T>(query: string, docs: { item: T; text: string }[]): { item: T; score: number }[] {
	const q = [...new Set(tokens(query))];
	if (!q.length || !docs.length) return [];
	const split = docs.map((d) => ({ item: d.item, words: tokens(d.text) }));
	const avg = split.reduce((n, d) => n + d.words.length, 0) / split.length || 1;
	const idf = new Map(
		q.map((term) => {
			const df = split.filter((d) => d.words.includes(term)).length;
			return [term, Math.log((split.length - df + 0.5) / (df + 0.5) + 1)];
		})
	);
	return split
		.map(({ item, words }) => {
			let score = 0;
			for (const term of q) {
				const tf = words.filter((w) => w === term).length;
				score += (idf.get(term)! * tf * 2.5) / (tf + 1.5 * (0.25 + (0.75 * words.length) / avg));
			}
			return { item, score };
		})
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score);
}
