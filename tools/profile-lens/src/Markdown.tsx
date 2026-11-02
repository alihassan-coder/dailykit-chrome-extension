// Markdown-lite for chat replies: paragraphs, bullet and numbered lists, **bold**, `code` and links.
// Built as React elements (never innerHTML), and links only open http(s) addresses.
import { Fragment, type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

function link(href: string, label: ReactNode, key: number) {
	const url = safeUrl(href);
	if (!url) return <Fragment key={key}>{label}</Fragment>;
	return (
		<a
			key={key}
			href={url}
			target="_blank"
			rel="noreferrer noopener"
			className="text-accent-ink underline-offset-2 hover:underline"
		>
			{label}
		</a>
	);
}

/** Bold, inline code and links inside one line of text. */
export function inline(text: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let key = 0;
	for (const m of text.matchAll(INLINE)) {
		const token = m[0];
		if (m.index > last) out.push(text.slice(last, m.index));
		if (token.startsWith('**') || token.startsWith('__'))
			out.push(
				<strong key={key++} className="font-semibold">
					{token.slice(2, -2)}
				</strong>
			);
		else if (token.startsWith('`'))
			out.push(
				<code key={key++} className="rounded-xs bg-soft px-1 font-mono text-sm">
					{token.slice(1, -1)}
				</code>
			);
		else if (token.startsWith('[')) {
			const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
			out.push(link(href!, label, key++));
		} else out.push(link(token, token, key++));
		last = m.index + token.length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

export function blocks(text: string): Block[] {
	const out: Block[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trimEnd();
		const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
		const number = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		const prev = out.at(-1);
		if (bullet || number) {
			const kind = bullet ? 'ul' : 'ol';
			const item = (bullet ?? number)![1]!;
			if (prev && prev.kind === kind) prev.items.push(item);
			else out.push({ kind, items: [item] });
		} else if (!line.trim()) {
			if (prev && !(prev.kind === 'p' && prev.lines.length === 0)) out.push({ kind: 'p', lines: [] });
		} else if (prev?.kind === 'p') prev.lines.push(line.replace(/^#{1,6}\s+/, ''));
		else out.push({ kind: 'p', lines: [line.replace(/^#{1,6}\s+/, '')] });
	}
	return out.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

export function Markdown({ text }: { text: string }) {
	return (
		<div className="grid gap-1.5">
			{blocks(text).map((b, i) =>
				b.kind === 'p' ? (
					<p key={i} className="whitespace-pre-wrap">
						{b.lines.map((l, j) => (
							<Fragment key={j}>
								{j > 0 && '\n'}
								{inline(l)}
							</Fragment>
						))}
					</p>
				) : b.kind === 'ul' ? (
					<ul key={i} className="grid list-disc gap-0.5 pl-4 marker:text-faint">
						{b.items.map((it, j) => (
							<li key={j}>{inline(it)}</li>
						))}
					</ul>
				) : (
					<ol key={i} className="grid list-decimal gap-0.5 pl-4 marker:text-faint">
						{b.items.map((it, j) => (
							<li key={j}>{inline(it)}</li>
						))}
					</ol>
				)
			)}
		</div>
	);
}
