// Reading the page for the model, inside the page (content script). The page becomes short lines such as
//   nav "Primary":
//     * link "Home" [ref_3] href=/
//   button "Search" [ref_12]
//   textbox "Email" [ref_13] value="ali@…"
// grouped under their landmark or list item, with * marking what is in view. Refs are never renumbered while
// the page lives, so the model can act on what it read earlier; a ref whose element is gone gives a clear
// "stale" error instead of acting on the wrong thing. Open shadow roots are read too.

const INTERACTIVE =
	'a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=switch], [role=combobox], [role=textbox], [role=searchbox], [role=slider], [contenteditable=""], [contenteditable=true], [onclick], [tabindex]:not([tabindex^="-"])';
const STRUCTURE = 'h1, h2, h3, h4, h5, h6, main, nav, form, dialog, [role=dialog], [role=alertdialog], [role=alert]';
const TEXT = 'p, li, td, th, label';
/** Containers that give the lines inside them context. */
const GROUPS =
	'main, nav, form, dialog, [role=dialog], [role=alertdialog], header, footer, aside, article, section[aria-label], section[aria-labelledby], [role=region], [role=navigation], [role=main], [role=search], li, [role=listitem], table';
const MAX_DEPTH = 4;

export class RefRegistry {
	private next = 1;
	private refs = new Map<string, WeakRef<Element>>();
	private ids = new WeakMap<Element, string>();

	refFor(el: Element): string {
		let ref = this.ids.get(el);
		if (!ref) {
			ref = `ref_${this.next++}`;
			this.ids.set(el, ref);
			this.refs.set(ref, new WeakRef(el));
		}
		return ref;
	}

	/** The element for a ref, or null when it no longer exists on the page. */
	get(ref: string): Element | null {
		const el = this.refs.get(ref)?.deref();
		return el && el.isConnected ? el : null;
	}
}

/** The parent across shadow boundaries: a shadow root's top elements belong to its host. */
export function parentOf(el: Element): Element | null {
	if (el.parentElement) return el.parentElement;
	const root = el.getRootNode();
	return root instanceof ShadowRoot ? root.host : null;
}

/** Element.closest that also climbs out of shadow roots. */
export function closestDeep(el: Element, selector: string): Element | null {
	for (let cur: Element | null = el; cur; cur = parentOf(cur)) if (cur.matches(selector)) return cur;
	return null;
}

/** Every element under root in document order, including the contents of open shadow roots. */
export function* elements(root: Element | Document): Generator<Element> {
	const stack: Element[] = [];
	const pushChildren = (parent: Element | Document | ShadowRoot) => {
		for (let i = parent.children.length - 1; i >= 0; i--) stack.push(parent.children[i]!);
	};
	// The root itself is never listed: callers read inside it.
	if (root instanceof Element && root.shadowRoot) {
		pushChildren(root);
		pushChildren(root.shadowRoot);
	} else pushChildren(root);
	while (stack.length) {
		const el = stack.pop()!;
		yield el;
		// Light children render after (or inside) the shadow tree; visiting shadow first keeps reading order.
		pushChildren(el);
		if (el.shadowRoot) pushChildren(el.shadowRoot);
	}
}

export function roleOf(el: Element): string {
	const explicit = el.getAttribute('role');
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
	if (tag === 'button' || tag === 'summary') return 'button';
	if (tag === 'select') return 'combobox';
	if (tag === 'textarea') return 'textbox';
	if (/^h[1-6]$/.test(tag)) return `heading level=${tag[1]}`;
	if (tag === 'input') {
		const type = (el as HTMLInputElement).type;
		if (type === 'checkbox' || type === 'radio') return type;
		if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button';
		return type === 'search' ? 'searchbox' : 'textbox';
	}
	if (el.getAttribute('contenteditable') !== null && el.getAttribute('contenteditable') !== 'false') return 'textbox';
	const implicit: Record<string, string> = {
		main: 'main',
		nav: 'nav',
		form: 'form',
		dialog: 'dialog',
		li: 'listitem',
		article: 'article',
		header: 'header',
		footer: 'footer',
		aside: 'aside',
		section: 'region',
		table: 'table'
	};
	return implicit[tag] ?? 'generic';
}

const clean = (text: string | null | undefined, max = 80) => {
	const t = (text ?? '').replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Fields, landmarks and lists are never named after the text inside them: that is noise for the model. */
const NO_TEXT_NAME = new Set([
	'input',
	'select',
	'textarea',
	'form',
	'nav',
	'main',
	'dialog',
	'header',
	'footer',
	'aside',
	'article',
	'section',
	'table',
	'ul',
	'ol'
]);

function labelledBy(el: Element): string {
	const ids = el.getAttribute('aria-labelledby');
	if (!ids) return '';
	const root = el.getRootNode() as Document | ShadowRoot;
	return clean(
		ids
			.split(/\s+/)
			.map((id) => root.getElementById?.(id)?.textContent ?? el.ownerDocument.getElementById(id)?.textContent ?? '')
			.join(' ')
	);
}

export function nameOf(el: Element): string {
	const byId = labelledBy(el);
	if (byId) return byId;
	const aria = el.getAttribute('aria-label');
	if (clean(aria)) return clean(aria);
	const labels = (el as HTMLInputElement).labels;
	if (labels?.length) return clean([...labels].map((l) => l.textContent).join(' '));
	const tag = el.tagName.toLowerCase();
	if (tag === 'input' && ['submit', 'button', 'reset'].includes((el as HTMLInputElement).type)) {
		return clean((el as HTMLInputElement).value || (el as HTMLInputElement).type);
	}
	return clean(
		el.getAttribute('placeholder') ??
			el.getAttribute('alt') ??
			el.getAttribute('title') ??
			(NO_TEXT_NAME.has(tag) ? '' : el.textContent)
	);
}

/** What the element shows on screen, for the approval card: "Place order", "Delete". */
export function visibleText(el: Element): string {
	const text = 'innerText' in el ? (el as HTMLElement).innerText : '';
	return clean(text || el.textContent || (el as HTMLInputElement).value, 80);
}

/** Password, payment and one-time-code fields: their values never reach the model. */
export function isSensitive(el: Element): boolean {
	if (!(el instanceof HTMLInputElement)) return false;
	const autocomplete = (el.autocomplete || el.getAttribute('autocomplete') || '').toLowerCase();
	return (
		el.type === 'password' ||
		autocomplete.startsWith('cc-') ||
		autocomplete === 'one-time-code' ||
		/card|cvc|cvv|otp/i.test(el.name)
	);
}

/** True in a real browser; jsdom (tests) has no layout, so size and position checks are skipped there. */
export function hasLayout(doc: Document): boolean {
	return doc.documentElement.getBoundingClientRect().height > 0;
}

function insideClosedDetails(el: Element): boolean {
	const details = closestDeep(el, 'details:not([open])');
	if (!details || details === el) return false;
	const summary = details.querySelector(':scope > summary');
	return !(summary && (summary === el || summary.contains(el)));
}

export function isHidden(el: Element, layout = hasLayout(el.ownerDocument)): boolean {
	if (closestDeep(el, '[aria-hidden="true"], [hidden], [inert], toolbelt-cairn')) return true;
	if (insideClosedDetails(el)) return true;
	const view = el.ownerDocument.defaultView;
	if (layout && typeof el.checkVisibility === 'function') {
		if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true;
	} else {
		const style = view?.getComputedStyle(el);
		if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return true;
	}
	if (!layout) return false;
	const r = el.getBoundingClientRect();
	if (r.width === 0 && r.height === 0) return true;
	// Moved off the page (the "visually hidden" trick): further left or above than anyone can scroll.
	return r.right + (view?.scrollX ?? 0) <= 0 || r.bottom + (view?.scrollY ?? 0) <= 0;
}

export function inViewport(el: Element): boolean {
	const view = el.ownerDocument.defaultView;
	if (!view) return false;
	const r = el.getBoundingClientRect();
	return r.bottom > 0 && r.right > 0 && r.top < view.innerHeight && r.left < view.innerWidth;
}

// Elements that only look clickable (a div with a click handler and a pointer cursor).
function looksClickable(el: Element, layout: boolean): boolean {
	if (!layout || !(el instanceof HTMLElement)) return false;
	const view = el.ownerDocument.defaultView;
	if (view?.getComputedStyle(el).cursor !== 'pointer') return false;
	const parent = parentOf(el);
	// Only the outermost pointer element counts, not every span inside a clickable card.
	if (parent && view.getComputedStyle(parent).cursor === 'pointer') return false;
	return Boolean(clean(el.textContent) || el.getAttribute('aria-label') || el.querySelector('img, svg'));
}

function valueOf(el: Element): string | null {
	if (el instanceof HTMLInputElement) {
		if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? 'checked' : null;
		if (!el.value || ['submit', 'button', 'reset', 'image'].includes(el.type)) return null;
		return isSensitive(el) ? '••••' : clean(el.value, 60);
	}
	if (el instanceof HTMLTextAreaElement) return el.value ? clean(el.value, 60) : null;
	if (el instanceof HTMLSelectElement) return clean(el.selectedOptions[0]?.textContent, 60) || null;
	return null;
}

export function describe(el: Element, registry: RefRegistry): string {
	const role = roleOf(el);
	const name = nameOf(el);
	const value = valueOf(el);
	const disabled = (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' ? ' disabled' : '';
	const expanded = el.getAttribute('aria-expanded');
	const state = expanded ? ` expanded=${expanded}` : '';
	const href = el instanceof HTMLAnchorElement && el.href ? ` href=${clean(el.getAttribute('href'), 60)}` : '';
	return `${role}${name ? ` "${name}"` : ''} [${registry.refFor(el)}]${value ? ` value="${value}"` : ''}${href}${state}${disabled}`;
}

function groupLabel(g: Element): string {
	const name = labelledBy(g) || clean(g.getAttribute('aria-label'));
	return `${roleOf(g)}${name ? ` "${name}"` : ''}:`;
}

export interface ReadOptions {
	/** Everything with a name, not only things you can click or type into. */
	all?: boolean;
	/** Read only inside this element. */
	ref?: string;
	maxChars?: number;
}

interface Item {
	el: Element;
	line: string;
	inView: boolean;
	/** Group ancestors, outermost first, inside the read root. */
	groups: Element[];
}

function groupsOf(el: Element, root: Element): Element[] {
	const out: Element[] = [];
	for (let cur = parentOf(el); cur && cur !== root; cur = parentOf(cur)) if (cur.matches(GROUPS)) out.unshift(cur);
	return out.slice(-MAX_DEPTH);
}

/** The visible elements a read lists, with their lines. */
function collect(root: Element, registry: RefRegistry, selector: string, layout: boolean): Item[] {
	const items: Item[] = [];
	for (const el of elements(root)) {
		const listed = el.matches(selector) || looksClickable(el, layout);
		if (!listed || isHidden(el, layout)) continue;
		items.push({ el, line: describe(el, registry), inView: layout && inViewport(el), groups: groupsOf(el, root) });
	}
	return items;
}

/** The interactive elements on the page right now (used to tell what an action changed). */
export function interactiveElements(doc: Document): Set<Element> {
	const layout = hasLayout(doc);
	const out = new Set<Element>();
	for (const el of elements(doc.body)) if (el.matches(INTERACTIVE) && !isHidden(el, layout)) out.add(el);
	return out;
}

/** The page as lines the model can read and act on. */
export function readPage(doc: Document, registry: RefRegistry, opts: ReadOptions = {}): string {
	const root = opts.ref ? registry.get(opts.ref) : doc.body;
	if (!root) return `${opts.ref} is stale or not found. Read the page again.`;
	const layout = hasLayout(doc);
	const selector = opts.all ? `${INTERACTIVE}, ${STRUCTURE}, ${TEXT}` : `${INTERACTIVE}, ${STRUCTURE}`;
	const max = opts.maxChars ?? 50_000;
	const items = collect(root, registry, selector, layout);

	// Over budget: keep what is in view first, then the rest in page order.
	const cost = (i: Item) => i.line.length + 2 * (i.groups.length + 1) + 3;
	let keep = new Set(items);
	let truncated = false;
	if (items.reduce((n, i) => n + cost(i), 0) > max) {
		truncated = true;
		keep = new Set();
		let used = 0;
		for (const i of [...items.filter((i) => i.inView), ...items.filter((i) => !i.inView)]) {
			if (used + cost(i) > max) continue;
			keep.add(i);
			used += cost(i);
		}
	}

	const lines: string[] = [];
	const shown = new Set<Element>();
	for (const item of items) {
		if (!keep.has(item)) continue;
		item.groups.forEach((g, depth) => {
			if (shown.has(g)) return;
			shown.add(g);
			lines.push(`${'  '.repeat(depth)}${groupLabel(g)}`);
		});
		shown.add(item.el);
		lines.push(`${'  '.repeat(item.groups.length)}${item.inView ? '* ' : ''}${item.line}`);
	}
	if (truncated) lines.push('… (page truncated; scroll, use find, or read_page with a ref to see more)');
	return lines.join('\n') || '(nothing to interact with on this page)';
}

/** Elements whose name, role or value contains every word of the query, in view first. */
export function find(doc: Document, registry: RefRegistry, query: string, limit = 20): string {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const layout = hasLayout(doc);
	const matches = collect(doc.body, registry, `${INTERACTIVE}, ${STRUCTURE}, label, p`, layout).filter((i) =>
		words.every((w) => i.line.toLowerCase().includes(w))
	);
	const sorted = [...matches.filter((i) => i.inView), ...matches.filter((i) => !i.inView)].slice(0, limit);
	return sorted.map((i) => `${i.inView ? '* ' : ''}${i.line}`).join('\n') || `Nothing on the page matches "${query}".`;
}

/** The readable text of the page, for questions about its content. */
export function pageText(doc: Document, maxChars = 30_000): string {
	const body = doc.body;
	const text = (('innerText' in body ? body.innerText : '') || body.textContent || '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (truncated)` : text;
}

/** Text-like inputs whose selected text may be read (never passwords, never hidden fields). */
const SELECTABLE_INPUTS = new Set(['text', 'search', 'url', 'tel', '']);

/** What the user has selected on the page (in the document or a text box), trimmed and capped; '' for none. */
export function selectedText(doc: Document, maxChars = 8000): string {
	const el = doc.activeElement;
	let text = '';
	if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && SELECTABLE_INPUTS.has(el.type))) {
		try {
			const start = el.selectionStart ?? 0;
			const end = el.selectionEnd ?? 0;
			text = end > start ? el.value.slice(start, end) : '';
		} catch {
			text = ''; // a field type without a text selection
		}
	}
	if (!text) text = doc.getSelection?.()?.toString() ?? '';
	text = text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > maxChars ? text.slice(0, maxChars) : text;
}
