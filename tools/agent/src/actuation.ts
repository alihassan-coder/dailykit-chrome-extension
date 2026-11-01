// Acting on the page, inside the page (content script), only after the user approved the action.
import { isSensitive, nameOf, roleOf, type RefRegistry } from './perception.ts';

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

const stale = (ref: string): ActionResult => ({
	ok: false,
	message: `${ref} is stale or not found. Read the page again.`
});

/** What the approval card shows about a target. */
export function target(registry: RefRegistry, ref: string) {
	const el = registry.get(ref);
	return el ? { role: roleOf(el), name: nameOf(el), sensitive: isSensitive(el) } : null;
}

// Frameworks like React track input values themselves; setting .value directly is ignored by them.
// Using the native setter and firing input/change is what a real keystroke looks like to them.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressKey(el: Element, key: string) {
	for (const type of ['keydown', 'keypress', 'keyup'] as const) {
		el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
	}
}

export function perform(registry: RefRegistry, action: PageAction, doc: Document = document): ActionResult {
	switch (action.kind) {
		case 'click': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if ((el as HTMLButtonElement).disabled) return { ok: false, message: `${action.ref} is disabled.` };
			(el as HTMLElement).scrollIntoView?.({ block: 'center' });
			(el as HTMLElement).focus?.();
			(el as HTMLElement).click();
			return { ok: true, message: `Clicked ${roleOf(el)} "${nameOf(el)}".` };
		}
		case 'type': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
				el.focus();
				setNativeValue(el, action.text);
			} else if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') !== null) {
				(el as HTMLElement).focus();
				el.textContent = action.text;
				el.dispatchEvent(new InputEvent('input', { bubbles: true, data: action.text }));
			} else {
				return { ok: false, message: `${action.ref} is not a text field.` };
			}
			if (action.submit) {
				pressKey(el, 'Enter');
				(el as HTMLInputElement).form?.requestSubmit?.();
			}
			return { ok: true, message: `Typed into "${nameOf(el)}"${action.submit ? ' and submitted' : ''}.` };
		}
		case 'form_input': {
			const el = registry.get(action.ref);
			if (!el) return stale(action.ref);
			if (el instanceof HTMLSelectElement) {
				const option = [...el.options].find((o) => o.value === action.value || o.textContent?.trim() === action.value);
				if (!option) return { ok: false, message: `"${String(action.value)}" is not an option of ${action.ref}.` };
				el.value = option.value;
				el.dispatchEvent(new Event('change', { bubbles: true }));
				return { ok: true, message: `Selected "${option.textContent?.trim()}".` };
			}
			if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
				if (el.checked !== Boolean(action.value)) el.click();
				return { ok: true, message: `${el.checked ? 'Checked' : 'Unchecked'} "${nameOf(el)}".` };
			}
			return { ok: false, message: `${action.ref} is not a select, checkbox or radio button.` };
		}
		case 'key': {
			const el = doc.activeElement ?? doc.body;
			for (const key of action.keys.split(/\s+/)) pressKey(el, key);
			return { ok: true, message: `Pressed ${action.keys}.` };
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
