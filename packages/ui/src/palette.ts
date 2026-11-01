// Command palette search: what to show, best match first.

export interface Command {
	id: string;
	title: string;
	/** Other words people might type: "grayscale" for Black and white. */
	keywords?: string[];
	/** Short hint shown on the right, e.g. a shortcut or "Tool". */
	hint?: string;
	run: () => void;
}

/** True when every letter of `query` appears in `text` in order (cpk -> Colour picker). */
function subsequence(query: string, text: string) {
	let i = 0;
	for (const ch of text) if (ch === query[i]) i++;
	return i === query.length;
}

function score(query: string, c: Command): number {
	const title = c.title.toLowerCase();
	const words = title.split(/\s+/);
	const keywords = (c.keywords ?? []).map((k) => k.toLowerCase());
	if (title.startsWith(query)) return 100;
	if (words.some((w) => w.startsWith(query))) return 80;
	if (keywords.some((k) => k.startsWith(query) || k.split(/\s+/).some((w) => w.startsWith(query)))) return 60;
	if (title.includes(query)) return 40;
	// Fuzzy only from the start of a word, so "ca" does not drag in "bla(c)k (a)nd white".
	if (words.some((w) => w.startsWith(query[0]!)) && subsequence(query, title.replace(/\s+/g, ''))) return 20;
	return 0;
}

export function rankCommands(query: string, commands: Command[]): Command[] {
	const q = query.trim().toLowerCase();
	if (!q) return commands;
	return commands
		.map((c, index) => ({ c, index, s: score(q, c) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s || a.index - b.index)
		.map((x) => x.c);
}
