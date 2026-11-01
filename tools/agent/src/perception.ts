// Reading the page for the model, inside the page (content script). The page becomes short lines such as
//   button "Search" [ref_12]
//   textbox "Email" [ref_13] value="ali@…"
// Refs are never renumbered while the page lives, so the model can act on what it read earlier; a ref
// whose element is gone gives a clear "stale" error instead of acting on the wrong thing.

const INTERACTIVE =
	'a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=combobox], [role=textbox], [contenteditable=""], [contenteditable=true]';
const STRUCTURE = 'h1, h2, h3, h4, h5, h6, main, nav, form, dialog, [role=dialog], [role=alert]';

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

export function roleOf(el: Element): string {
	const explicit = el.getAttribute('role');
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	if (tag === 'a') return 'link';
	if (tag === 'button' || tag === 'summary') return 'button';
	if (tag === 'select') return 'combobox';
	if (tag === 'textarea') return 'textbox';
	if (/^h[1-6]$/.test(tag)) return `heading level=${tag[1]}`;
	if (tag === 'input') {
		const type = (el as HTMLInputElement).type;
		if (type === 'checkbox' || type === 'radio') return type;
		if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
		return type === 'search' ? 'searchbox' : 'textbox';
	}
	if (el.getAttribute('contenteditable') !== null) return 'textbox';
	return tag === 'main' || tag === 'nav' || tag === 'form' || tag === 'dialog' ? tag : 'generic';
}

const clean = (text: string | null | undefined, max = 80) => {
	const t = (text ?? '').replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function nameOf(el: Element): string {
	const labelledBy = el.getAttribute('aria-labelledby');
	if (labelledBy) {
		const text = labelledBy
			.split(/\s+/)
			.map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
			.join(' ');
		if (clean(text)) return clean(text);
	}
	const aria = el.getAttribute('aria-label');
	if (clean(aria)) return clean(aria);
	const labels = (el as HTMLInputElement).labels;
	if (labels?.length) return clean([...labels].map((l) => l.textContent).join(' '));
	const tag = el.tagName.toLowerCase();
	if (tag === 'input' && ['submit', 'button', 'reset'].includes((el as HTMLInputElement).type)) {
		return clean((el as HTMLInputElement).value);
	}
	// Fields and landmarks (form, nav, ...) are never named after the text inside them: a form "named" by all of
	// its labels is noise for the model and hides the field that really has that name.
	const noTextName = ['input', 'select', 'textarea', 'form', 'nav', 'main', 'dialog'].includes(tag);
	return clean(
		el.getAttribute('placeholder') ??
			el.getAttribute('alt') ??
			el.getAttribute('title') ??
			(noTextName ? '' : el.textContent)
	);
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

function hidden(el: Element): boolean {
	if (el.closest('[aria-hidden="true"], [hidden], toolbelt-cairn')) return true;
	const view = el.ownerDocument.defaultView;
	const style = view?.getComputedStyle(el);
	return !!style && (style.display === 'none' || style.visibility === 'hidden');
}

function valueOf(el: Element): string | null {
	if (el instanceof HTMLInputElement) {
		if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? 'checked' : null;
		if (!el.value) return null;
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
	const disabled = (el as HTMLButtonElement).disabled ? ' disabled' : '';
	const href = el instanceof HTMLAnchorElement && el.href ? ` href=${clean(el.getAttribute('href'), 60)}` : '';
	return `${role}${name ? ` "${name}"` : ''} [${registry.refFor(el)}]${value ? ` value="${value}"` : ''}${href}${disabled}`;
}

export interface ReadOptions {
	/** Everything with a name, not only things you can click or type into. */
	all?: boolean;
	/** Read only inside this element. */
	ref?: string;
	maxChars?: number;
}

/** The page as lines the model can read and act on. */
export function readPage(doc: Document, registry: RefRegistry, opts: ReadOptions = {}): string {
	const root = opts.ref ? registry.get(opts.ref) : doc.body;
	if (!root) return `${opts.ref} is stale or not found. Read the page again.`;
	const selector = opts.all ? `${INTERACTIVE}, ${STRUCTURE}, p, li, td, th, label` : `${INTERACTIVE}, ${STRUCTURE}`;
	const max = opts.maxChars ?? 50_000;
	const lines: string[] = [];
	let length = 0;
	for (const el of root.querySelectorAll(selector)) {
		if (hidden(el)) continue;
		const line = describe(el, registry);
		if (length + line.length > max) {
			lines.push('… (page truncated; use find or read_page with a ref to see more)');
			break;
		}
		lines.push(line);
		length += line.length + 1;
	}
	return lines.join('\n') || '(nothing to interact with on this page)';
}

/** Elements whose name, role or value contains every word of the query. */
export function find(doc: Document, registry: RefRegistry, query: string, limit = 20): string {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const matches: string[] = [];
	for (const el of doc.body.querySelectorAll(`${INTERACTIVE}, ${STRUCTURE}, label, p`)) {
		if (hidden(el)) continue;
		const line = describe(el, registry);
		if (words.every((w) => line.toLowerCase().includes(w))) matches.push(line);
		if (matches.length >= limit) break;
	}
	return matches.join('\n') || `Nothing on the page matches "${query}".`;
}

/** The readable text of the page, for questions about its content. */
export function pageText(doc: Document, maxChars = 30_000): string {
	const body = doc.body;
	const text = (('innerText' in body ? body.innerText : '') || body.textContent || '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (truncated)` : text;
}
