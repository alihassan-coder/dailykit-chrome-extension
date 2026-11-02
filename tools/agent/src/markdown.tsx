// A tiny, safe Markdown renderer for the agent's answers: paragraphs, bullet and numbered lists, headings
// (shown as bold lines), code blocks, **bold**, *italic*, `code` and [links](https://…). It builds React
// elements only (no HTML strings), and links are http(s) only, so page-influenced text can't inject markup.
import type { ReactNode } from 'react';

const INLINE =
	/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|(?<![\w*])\*[^*\n]+\*(?![\w*])|(?<!\w)_[^_\n]+_(?!\w))/g;

function safeHref(href: string): string | null {
	try {
		const url = new URL(href);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

export function inline(text: string, key = 'i'): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let n = 0;
	for (const match of text.matchAll(INLINE)) {
		const token = match[0];
		const at = match.index;
		if (at > last) out.push(text.slice(last, at));
		const k = `${key}-${n++}`;
		if (token.startsWith('**'))
			out.push(
				<strong key={k} className="font-semibold text-ink">
					{token.slice(2, -2)}
				</strong>
			);
		else if (token.startsWith('`'))
			out.push(
				<code key={k} className="rounded-xs bg-soft px-1 font-mono text-sm text-ink">
					{token.slice(1, -1)}
				</code>
			);
		else if (token.startsWith('[')) {
			const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
			const safe = safeHref(href);
			out.push(
				safe ? (
					<a
						key={k}
						href={safe}
						target="_blank"
						rel="noreferrer noopener"
						className="text-accent-ink underline underline-offset-2"
					>
						{label}
					</a>
				) : (
					label
				)
			);
		} else out.push(<em key={k}>{token.slice(1, -1)}</em>);
		last = at + token.length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

type Block =
	| { kind: 'p'; lines: string[] }
	| { kind: 'h'; text: string }
	| { kind: 'ul' | 'ol'; items: string[] }
	| { kind: 'code'; text: string };

export function blocks(source: string): Block[] {
	const out: Block[] = [];
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const prev = out.at(-1);
		if (/^```/.test(line.trim())) {
			const code: string[] = [];
			for (i++; i < lines.length && !/^```/.test(lines[i]!.trim()); i++) code.push(lines[i]!);
			out.push({ kind: 'code', text: code.join('\n') });
			continue;
		}
		if (!line.trim()) {
			out.push({ kind: 'p', lines: [] });
			continue;
		}
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		if (heading) {
			out.push({ kind: 'h', text: heading[1]! });
			continue;
		}
		const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		const item = bullet ?? numbered;
		if (item) {
			const kind = bullet ? 'ul' : 'ol';
			if (prev?.kind === kind) prev.items.push(item[1]!);
			else out.push({ kind, items: [item[1]!] });
			continue;
		}
		// A line indented under a list item continues it.
		if ((prev?.kind === 'ul' || prev?.kind === 'ol') && /^\s{2,}\S/.test(line)) {
			prev.items[prev.items.length - 1] += ` ${line.trim()}`;
			continue;
		}
		if (prev?.kind === 'p' && prev.lines.length) prev.lines.push(line);
		else out.push({ kind: 'p', lines: [line] });
	}
	return out.filter((b) => b.kind !== 'p' || b.lines.length);
}

/** The answer, as React elements. */
export function Markdown({ text }: { text: string }) {
	return (
		<div className="grid gap-2 leading-relaxed">
			{blocks(text).map((b, i) => {
				const key = `b${i}`;
				switch (b.kind) {
					case 'h':
						return (
							<p key={key} className="font-semibold text-ink">
								{inline(b.text, key)}
							</p>
						);
					case 'code':
						return (
							<pre key={key} className="overflow-x-auto rounded-md bg-soft px-2.5 py-2 font-mono text-sm text-ink">
								{b.text}
							</pre>
						);
					case 'ul':
					case 'ol': {
						const List = b.kind;
						return (
							<List key={key} className={`grid gap-1 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
								{b.items.map((item, j) => (
									<li key={`${key}-${j}`}>{inline(item, `${key}-${j}`)}</li>
								))}
							</List>
						);
					}
					default:
						return (
							<p key={key} className="whitespace-pre-wrap">
								{b.lines.flatMap((line, j) =>
									j ? ['\n', ...inline(line, `${key}-${j}`)] : inline(line, `${key}-${j}`)
								)}
							</p>
						);
				}
			})}
		</div>
	);
}
