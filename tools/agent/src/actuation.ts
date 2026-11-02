// Acting on the page, inside the page (content script), only after the user approved the action. Actions
// look like a person's: a full pointer sequence for clicks, real input events for typing, the native value
// setter for selects. After acting, the page is given a moment to settle and the result says what changed.
import {
	closestDeep,
	interactiveElements,
	isHidden,
	isSensitive,
	nameOf,
	roleOf,
	visibleText,
	type RefRegistry
} from './perception.ts';

export type PageAction =
	| { kind: 'click'; ref: string }
	| { kind: 'type'; ref: string; text: string; submit?: boolean }
	| { kind: 'form_input'; ref: string; value: string | boolean }
	| { kind: 'key'; keys: string }
	| { kind: 'scroll'; direction: 'up' | 'down'; ref?: string };

export interface ActionResult {
	ok: boolean;
	message: string;
}

/** What the policy and the approval card know about an element. */
export interface TargetInfo {
	role: string;
	name: string;
	sensitive: boolean;
	/** The visible text, for the approval card. */
	text?: string;
	/** The element is inside a form. */
	inForm?: boolean;
	/** The visible name of that form's submit button. */
	submitName?: string;
	/** The element's ref (for the focused element, which the model did not name). */
	ref?: string;
}

const stale = (ref: string): ActionResult => ({
	ok: false,
	message: `${ref} is stale or not found. Read the page again.`
});

function formOf(el: Element): HTMLFormElement | null {
	return (el as HTMLInputElement).form ?? (el.closest('form') as HTMLFormElement | null);
}

const isSubmitControl = (el: Element) =>
	(el instanceof HTMLButtonElement && el.type === 'submit') ||
	(el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'image'));

function submitButtonOf(form: HTMLFormElement): HTMLElement | null {
	return ([...form.elements].find(isSubmitControl) as HTMLElement | undefined) ?? null;
}

export function describeTarget(el: Element, registry?: RefRegistry): TargetInfo {
	const form = formOf(el);
	const submitter = form ? submitButtonOf(form) : null;
	const sensitive = isSensitive(el);
	return {
		role: roleOf(el),
		name: nameOf(el),
		sensitive,
		text:
			sensitive || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? undefined : visibleText(el),
		inForm: Boolean(form),
		submitName: submitter ? nameOf(submitter) : undefined,
		ref: registry?.refFor(el)
	};
}

/** What the approval card shows about a target. */
export function target(registry: RefRegistry, ref: string): TargetInfo | null {
	const el = registry.get(ref);
	return el ? describeTarget(el) : null;
}

/** The focused element, through open shadow roots, or null when nothing is focused. */
export function focusedElement(doc: Document): Element | null {
	let el: Element | null = doc.activeElement;
	while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
	return el && el !== doc.body && el !== doc.documentElement ? el : null;
}

export function focusedTarget(registry: RefRegistry, doc: Document = document): TargetInfo | null {
	const el = focusedElement(doc);
	return el ? describeTarget(el, registry) : null;
}

// Frameworks like React track input values themselves; setting .value directly is ignored by them.
// Using the native setter and firing input/change is what a real keystroke looks like to them.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
	const proto =
		el instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: el instanceof HTMLSelectElement
				? HTMLSelectElement.prototype
				: HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
	el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

const isDisabled = (el: Element) =>
	(el as HTMLButtonElement).disabled === true || closestDeep(el, '[aria-disabled="true"], fieldset[disabled]') !== null;

/** pointerdown, mousedown, focus, pointerup, mouseup, click: what a real click dispatches, at the element's centre. */
export function pointerClick(el: HTMLElement) {
	el.scrollIntoView?.({ block: 'center', inline: 'center' });
	const r = el.getBoundingClientRect();
	const at = {
		bubbles: true,
		cancelable: true,
		composed: true,
		clientX: r.left + r.width / 2,
		clientY: r.top + r.height / 2,
		button: 0
	};
	const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
	const pointer = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true };
	el.dispatchEvent(new Pointer('pointerover', pointer));
	el.dispatchEvent(new MouseEvent('mouseover', at));
	el.dispatchEvent(new Pointer('pointerdown', { ...pointer, buttons: 1 }));
	const down = el.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1, detail: 1 }));
	if (down) el.focus?.({ preventScroll: true });
	el.dispatchEvent(new Pointer('pointerup', pointer));
	el.dispatchEvent(new MouseEvent('mouseup', { ...at, detail: 1 }));
	el.dispatchEvent(new MouseEvent('click', { ...at, detail: 1 }));
}

const MODIFIERS: Record<string, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> = {
	control: 'ctrlKey',
	ctrl: 'ctrlKey',
	shift: 'shiftKey',
	alt: 'altKey',
	option: 'altKey',
	meta: 'metaKey',
	cmd: 'metaKey',
	command: 'metaKey'
};
const KEY_NAMES: Record<string, string> = { esc: 'Escape', return: 'Enter', space: ' ', spacebar: ' ', del: 'Delete' };

/** Presses one key chord ("Enter", "Control+a") on el. Returns false when the page cancelled the keydown. */
function pressKey(el: Element, chord: string): boolean {
	const parts = chord.split('+').filter(Boolean);
	const raw = parts.pop() ?? chord;
	const key = KEY_NAMES[raw.toLowerCase()] ?? (raw.length === 1 ? raw : raw[0]!.toUpperCase() + raw.slice(1));
	const mods: KeyboardEventInit = {};
	for (const m of parts) {
		const flag = MODIFIERS[m.toLowerCase()];
		if (flag) mods[flag] = true;
	}
	const init = { key, bubbles: true, cancelable: true, composed: true, ...mods };
	const allowed = el.dispatchEvent(new KeyboardEvent('keydown', init));
	if (allowed && (key.length === 1 || key === 'Enter')) el.dispatchEvent(new KeyboardEvent('keypress', init));
	el.dispatchEvent(new KeyboardEvent('keyup', init));
	return allowed;
}

/** Submitting the way a person would: Enter in the field, then the form's submit button (or requestSubmit). */
function submitFrom(el: Element): string {
	if (!pressKey(el, 'Enter')) return 'pressed Enter';
	const form = formOf(el);
	if (!form) return 'pressed Enter';
	const submitter = submitButtonOf(form);
	if (submitter && !isDisabled(submitter)) {
		pointerClick(submitter);
		return `submitted with “${nameOf(submitter)}”`;
	}
	form.requestSubmit?.();
	return 'submitted the form';
}

function typeInto(el: HTMLElement, text: string): boolean {
	const doc = el.ownerDocument;
	el.focus();
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
		if (el.readOnly) return false;
		setNativeValue(el, text);
		return true;
	}
	if (!el.isContentEditable && el.getAttribute('contenteditable') === null) return false;
	// Select what is there, then insert: editors (ProseMirror, Lexical, Draft) listen for real input events.
	const range = doc.createRange();
	range.selectNodeContents(el);
	const selection = doc.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	let inserted: boolean;
	try {
		inserted = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
	} catch {
		inserted = false; // execCommand is not implemented everywhere; fall back to input events below.
	}
	if (!inserted || el.textContent !== text) {
		const init = { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text };
		if (el.dispatchEvent(new InputEvent('beforeinput', init))) {
			el.textContent = text;
			el.dispatchEvent(new InputEvent('input', init));
		}
	}
	return true;
}

export function perform(registry: RefRegistry, action: PageAction, doc: Document = document): ActionResult {
	switch (action.kind) {
		case 'click': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if (isDisabled(el)) return { ok: false, message: `${action.ref} is disabled.` };
			pointerClick(el as HTMLElement);
			return { ok: true, message: `Clicked ${roleOf(el)} "${nameOf(el)}".` };
		}
		case 'type': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if (isDisabled(el)) return { ok: false, message: `${action.ref} is disabled.` };
			(el as HTMLElement).scrollIntoView?.({ block: 'center' });
			if (!typeInto(el as HTMLElement, action.text))
				return { ok: false, message: `${action.ref} is not a text field you can type into.` };
			const how = action.submit ? `, then ${submitFrom(el)}` : '';
			return { ok: true, message: `Typed into "${nameOf(el)}"${how}.` };
		}
		case 'form_input': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if (isDisabled(el)) return { ok: false, message: `${action.ref} is disabled.` };
			(el as HTMLElement).scrollIntoView?.({ block: 'center' });
			if (el instanceof HTMLSelectElement) {
				const option = [...el.options].find((o) => o.value === action.value || o.textContent?.trim() === action.value);
				if (!option) return { ok: false, message: `"${String(action.value)}" is not an option of ${action.ref}.` };
				el.focus();
				setNativeValue(el, option.value);
				return { ok: true, message: `Selected "${option.textContent?.trim()}".` };
			}
			if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
				if (el.checked !== Boolean(action.value)) pointerClick(el);
				return { ok: true, message: `${el.checked ? 'Checked' : 'Unchecked'} "${nameOf(el)}".` };
			}
			return { ok: false, message: `${action.ref} is not a select, checkbox or radio button.` };
		}
		case 'key': {
			const el = (focusedElement(doc) ?? doc.body) as HTMLElement;
			const done: string[] = [];
			for (const chord of action.keys.split(/\s+/).filter(Boolean)) {
				const lone = !chord.includes('+') || chord.endsWith('+');
				const key = chord.toLowerCase();
				const isEnter = lone && (key === 'enter' || key === 'return');
				const isSpace = lone && (key === 'space' || key === 'spacebar' || chord === ' ');
				const pressable = el.matches(
					'button, a[href], summary, [role=button], [role=link], [role=menuitem], [role=tab]'
				);
				if (isEnter && formOf(el) && el.matches('input, textarea') && !(el instanceof HTMLTextAreaElement)) {
					done.push(submitFrom(el));
					continue;
				}
				const allowed = pressKey(el, chord);
				// Synthetic keys do not press buttons by themselves; a person's Enter or Space would.
				if (allowed && pressable && (isEnter || (isSpace && !el.matches('a[href]')))) pointerClick(el);
				done.push(chord);
			}
			return {
				ok: true,
				message: `Pressed ${done.join(', ')}${el !== doc.body ? ` on ${roleOf(el)} "${nameOf(el)}"` : ''}.`
			};
		}
		case 'scroll': {
			const el = action.ref ? registry.get(action.ref) : null;
			if (action.ref && !el) return stale(action.ref);
			const amount = (action.direction === 'down' ? 1 : -1) * Math.round((doc.defaultView?.innerHeight ?? 800) * 0.8);
			if (el) (el as HTMLElement).scrollBy?.({ top: amount });
			else doc.defaultView?.scrollBy?.({ top: amount });
			return { ok: true, message: `Scrolled ${action.direction}.` };
		}
	}
}

/* ---------- Settling and what changed ---------- */

export interface Snapshot {
	url: string;
	title: string;
	interactive: Set<Element>;
	dialogs: Set<Element>;
}

const DIALOGS = 'dialog[open], [role=dialog], [role=alertdialog], [aria-modal="true"]';

function openDialogs(doc: Document): Set<Element> {
	return new Set([...doc.querySelectorAll(DIALOGS)].filter((d) => !isHidden(d)));
}

export function snapshot(doc: Document): Snapshot {
	return { url: doc.location.href, title: doc.title, interactive: interactiveElements(doc), dialogs: openDialogs(doc) };
}

/** Resolves once the DOM has been quiet for quietMs (or after maxMs, whichever comes first). */
export function settle(doc: Document, opts: { quietMs?: number; maxMs?: number } = {}): Promise<void> {
	const quietMs = opts.quietMs ?? 450;
	const maxMs = opts.maxMs ?? 3000;
	return new Promise((resolve) => {
		let quiet: ReturnType<typeof setTimeout>;
		const observer = new MutationObserver(() => {
			clearTimeout(quiet);
			quiet = setTimeout(done, quietMs);
		});
		const cap = setTimeout(done, maxMs);
		function done() {
			clearTimeout(quiet);
			clearTimeout(cap);
			observer.disconnect();
			resolve();
		}
		observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
		quiet = setTimeout(done, quietMs);
	});
}

/** One sentence on what an action changed: address, title, dialogs, new elements. */
export function changes(before: Snapshot, doc: Document): string {
	const after = snapshot(doc);
	const out: string[] = [];
	if (after.url !== before.url) out.push(`The address changed to ${after.url}.`);
	if (after.title !== before.title) out.push(`The title is now "${after.title}".`);
	const opened = [...after.dialogs].filter((d) => !before.dialogs.has(d));
	if (opened.length) {
		const name = nameOf(opened[0]!);
		out.push(`A dialog opened${name ? `: "${name}"` : ''}.`);
	} else if (before.dialogs.size > after.dialogs.size) out.push('A dialog closed.');
	const added = [...after.interactive].filter((el) => !before.interactive.has(el)).length;
	const removed = [...before.interactive].filter((el) => !el.isConnected || !after.interactive.has(el)).length;
	if (added) out.push(`${added} new interactive element${added === 1 ? '' : 's'} appeared.`);
	if (removed) out.push(`${removed} went away.`);
	return out.length ? out.join(' ') : 'Nothing visible changed on the page.';
}

/** Acts, waits for the page to settle, and reports what changed. */
export async function act(
	registry: RefRegistry,
	action: PageAction,
	doc: Document = document,
	opts: { quietMs?: number; maxMs?: number } = {}
): Promise<ActionResult> {
	const before = snapshot(doc);
	const result = perform(registry, action, doc);
	if (!result.ok) return result;
	await settle(doc, opts);
	return { ok: true, message: `${result.message} ${changes(before, doc)}` };
}

/** Waits until a selector matches a visible element or the page shows some text. */
export async function waitFor(
	doc: Document,
	opts: { selector?: string; text?: string; timeoutMs?: number }
): Promise<ActionResult> {
	const timeout = Math.min(opts.timeoutMs ?? 5000, 10_000);
	const met = () => {
		if (opts.selector) {
			let found: Element | null;
			try {
				found = doc.querySelector(opts.selector);
			} catch {
				return 'invalid' as const;
			}
			if (!found || isHidden(found)) return false;
		}
		if (opts.text && !(doc.body.innerText || doc.body.textContent || '').includes(opts.text)) return false;
		return true;
	};
	const what = opts.selector ? `"${opts.selector}"` : `the text "${opts.text}"`;
	const first = met();
	if (first === 'invalid') return { ok: false, message: `${opts.selector} is not a valid CSS selector.` };
	if (first) return { ok: true, message: `${what} is on the page.` };
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			if (met() === true) finish(true);
		});
		const timer = setTimeout(() => finish(false), timeout);
		function finish(ok: boolean) {
			clearTimeout(timer);
			observer.disconnect();
			resolve(
				ok
					? { ok: true, message: `${what} appeared.` }
					: { ok: false, message: `${what} did not appear within ${Math.round(timeout / 1000)} s.` }
			);
		}
		observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
	});
}
