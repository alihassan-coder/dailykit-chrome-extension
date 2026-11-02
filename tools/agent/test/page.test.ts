// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, focusedTarget, perform, target, waitFor } from '../src/actuation.ts';
import { RefRegistry, find, pageText, readPage } from '../src/perception.ts';

let registry: RefRegistry;

beforeEach(() => {
	registry = new RefRegistry();
	document.body.innerHTML = `
		<h1>Sign in</h1>
		<form id="f">
			<label for="email">Email</label><input id="email" type="email" value="ali@example.com">
			<label for="pw">Password</label><input id="pw" type="password" value="hunter2">
			<select id="lang" aria-label="Language"><option value="en">English</option><option value="ur">Urdu</option></select>
			<label><input id="remember" type="checkbox"> Remember me</label>
			<button type="submit">Sign in</button>
		</form>
		<a href="/help">Help</a>
		<button style="display:none">Hidden thing</button>
		<p>Welcome back to the example site.</p>`;
});

const refOf = (text: string) =>
	readPage(document, registry)
		.split('\n')
		.find((l) => l.includes(text))!
		.match(/\[(ref_\d+)\]/)![1]!;

describe('reading the page', () => {
	it('lists what you can act on, with roles, names and refs', () => {
		const page = readPage(document, registry);
		expect(page).toContain('heading level=1 "Sign in"');
		expect(page).toMatch(/textbox "Email" \[ref_\d+\] value="ali@example.com"/);
		expect(page).toMatch(/combobox "Language" \[ref_\d+\] value="English"/);
		expect(page).toMatch(/link "Help" \[ref_\d+\] href=\/help/);
	});

	it('never shows a password', () => {
		const page = readPage(document, registry);
		expect(page).not.toContain('hunter2');
		expect(page).toMatch(/textbox "Password" \[ref_\d+\] value="••••"/);
	});

	it('skips hidden elements', () => {
		expect(readPage(document, registry)).not.toContain('Hidden thing');
	});

	it('keeps the same ref for the same element across reads', () => {
		const first = refOf('Email');
		document.body.insertAdjacentHTML('afterbegin', '<button>New</button>');
		expect(refOf('Email')).toBe(first);
	});

	it('finds elements by words, and reads plain text', () => {
		expect(find(document, registry, 'remember')).toMatch(/checkbox "Remember me"/);
		expect(find(document, registry, 'nothing like this')).toMatch(/Nothing on the page matches/);
		expect(pageText(document)).toContain('Welcome back to the example site.');
	});
});

describe('acting on the page', () => {
	it('types into a field the way a keystroke would, firing input events', () => {
		const email = document.getElementById('email') as HTMLInputElement;
		const onInput = vi.fn();
		email.addEventListener('input', onInput);
		expect(perform(registry, { kind: 'type', ref: refOf('Email'), text: 'new@example.com' }).ok).toBe(true);
		expect(email.value).toBe('new@example.com');
		expect(onInput).toHaveBeenCalled();
	});

	it('clicks, selects options and ticks checkboxes', () => {
		const onSubmit = vi.fn((e: Event) => e.preventDefault());
		document.getElementById('f')!.addEventListener('submit', onSubmit);
		expect(perform(registry, { kind: 'click', ref: refOf('button "Sign in"') }).ok).toBe(true);
		expect(onSubmit).toHaveBeenCalled();
		expect(perform(registry, { kind: 'form_input', ref: refOf('Language'), value: 'Urdu' }).message).toBe(
			'Selected "Urdu".'
		);
		perform(registry, { kind: 'form_input', ref: refOf('Remember me'), value: true });
		expect((document.getElementById('remember') as HTMLInputElement).checked).toBe(true);
	});

	it('reports a stale ref instead of acting on the wrong element', () => {
		const ref = refOf('Help');
		document.querySelector('a')!.remove();
		expect(perform(registry, { kind: 'click', ref })).toEqual({
			ok: false,
			message: `${ref} is stale or not found. Read the page again.`
		});
	});

	it('tells the approval card when a field is sensitive', () => {
		expect(target(registry, refOf('Password'))).toMatchObject({
			role: 'textbox',
			name: 'Password',
			sensitive: true,
			inForm: true,
			submitName: 'Sign in'
		});
		expect(target(registry, refOf('Email'))?.sensitive).toBe(false);
	});
});

describe('reading more of the page', () => {
	it('groups lines under their landmark and indents them', () => {
		const page = readPage(document, registry);
		expect(page).toMatch(/^form \[ref_\d+\]$/m);
		expect(page).toMatch(/^ {2}textbox "Email"/m);
		expect(page).toMatch(/^link "Help"/m);
	});

	it('finds clickable elements that are not buttons, and reads open shadow roots', () => {
		document.body.insertAdjacentHTML('beforeend', '<div onclick="void 0">Open menu</div><div id="host"></div>');
		const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
		shadow.innerHTML = '<button>Inside shadow</button>';
		const page = readPage(document, registry);
		expect(page).toMatch(/generic "Open menu" \[ref_\d+\]/);
		expect(page).toMatch(/button "Inside shadow" \[ref_\d+\]/);
	});

	it('treats inert content and closed details as hidden, but keeps the summary', () => {
		document.body.insertAdjacentHTML(
			'beforeend',
			'<div inert><button>Behind the modal</button></div><details><summary>More</summary><button>Folded away</button></details>'
		);
		const page = readPage(document, registry);
		expect(page).not.toContain('Behind the modal');
		expect(page).not.toContain('Folded away');
		expect(page).toContain('button "More"');
	});
});

describe('acting like a person', () => {
	it('sends the full pointer sequence on click', () => {
		const help = document.querySelector('a')!;
		help.addEventListener('click', (e) => e.preventDefault());
		const seen: string[] = [];
		for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
			help.addEventListener(type, () => seen.push(type));
		perform(registry, { kind: 'click', ref: refOf('Help') });
		expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
	});

	it('types into a contenteditable editor with input events', () => {
		document.body.insertAdjacentHTML('beforeend', '<div contenteditable="true" aria-label="Message"><p>old</p></div>');
		const editor = document.querySelector('[contenteditable]')!;
		const inputs: string[] = [];
		editor.addEventListener('input', (e) => inputs.push((e as InputEvent).inputType));
		expect(perform(registry, { kind: 'type', ref: refOf('Message'), text: 'Hello' }).ok).toBe(true);
		expect(editor.textContent).toBe('Hello');
		expect(inputs).toContain('insertText');
	});

	it('selects with input and change events, the way frameworks expect', () => {
		const select = document.getElementById('lang') as HTMLSelectElement;
		const events: string[] = [];
		select.addEventListener('input', () => events.push('input'));
		select.addEventListener('change', () => events.push('change'));
		perform(registry, { kind: 'form_input', ref: refOf('Language'), value: 'ur' });
		expect(select.value).toBe('ur');
		expect(events).toEqual(['input', 'change']);
	});

	it('submits by clicking the form’s submit button', () => {
		const button = document.querySelector('button[type=submit]')!;
		const clicked = vi.fn();
		button.addEventListener('click', clicked);
		document.getElementById('f')!.addEventListener('submit', (e) => e.preventDefault());
		const result = perform(registry, { kind: 'type', ref: refOf('Email'), text: 'a@b.c', submit: true });
		expect(result.message).toContain('submitted with “Sign in”');
		expect(clicked).toHaveBeenCalledOnce();
	});

	it('presses keys on the focused element, and reports it for the policy', () => {
		const email = document.getElementById('email') as HTMLInputElement;
		email.focus();
		expect(focusedTarget(registry, document)).toMatchObject({ role: 'textbox', name: 'Email', inForm: true });
		const keys: string[] = [];
		email.addEventListener('keydown', (e) => keys.push(`${e.ctrlKey ? 'ctrl+' : ''}${e.key}`));
		perform(registry, { kind: 'key', keys: 'Control+a Escape' });
		expect(keys).toEqual(['ctrl+a', 'Escape']);
	});
});

describe('after acting', () => {
	it('waits for the page to settle and says what changed', async () => {
		const button = document.querySelector('button[type=submit]')!;
		button.addEventListener('click', (e) => {
			e.preventDefault();
			setTimeout(() => {
				document.body.insertAdjacentHTML(
					'beforeend',
					'<div role="dialog" aria-label="Welcome"><button>Close</button><a href="/next">Next</a></div>'
				);
			}, 10);
		});
		const result = await act(registry, { kind: 'click', ref: refOf('button "Sign in"') }, document, {
			quietMs: 40,
			maxMs: 500
		});
		expect(result.ok).toBe(true);
		expect(result.message).toContain('A dialog opened: "Welcome".');
		expect(result.message).toContain('2 new interactive elements appeared.');
	});

	it('waits for a selector or some text', async () => {
		setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<p class="done">All saved</p>'), 10);
		expect((await waitFor(document, { selector: '.done', timeoutMs: 500 })).ok).toBe(true);
		expect((await waitFor(document, { text: 'Never shown', timeoutMs: 50 })).ok).toBe(false);
		expect((await waitFor(document, { selector: '[[bad', timeoutMs: 50 })).message).toContain(
			'not a valid CSS selector'
		);
	});
});

describe('the selection', () => {
	it('reads text selected in the page, trimmed', async () => {
		const { selectedText } = await import('../src/perception.ts');
		const p = document.querySelector('p')!;
		const range = document.createRange();
		range.selectNodeContents(p);
		document.getSelection()!.removeAllRanges();
		document.getSelection()!.addRange(range);
		expect(selectedText(document)).toBe('Welcome back to the example site.');
		expect(selectedText(document, 7)).toBe('Welcome');
		document.getSelection()!.removeAllRanges();
		expect(selectedText(document)).toBe('');
	});

	it('reads a selection inside a text box, never inside a password field', async () => {
		const { selectedText } = await import('../src/perception.ts');
		document.body.insertAdjacentHTML('beforeend', '<input id="q" type="search" value="cheap flights">');
		const search = document.querySelector<HTMLInputElement>('#q')!;
		search.focus();
		search.setSelectionRange(0, 5);
		expect(selectedText(document)).toBe('cheap');
		const pw = document.querySelector<HTMLInputElement>('#pw')!;
		pw.focus();
		pw.setSelectionRange(0, 7);
		expect(selectedText(document)).toBe('');
	});
});
