// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { perform, target } from '../src/actuation.ts';
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
		expect(target(registry, refOf('Password'))).toEqual({ role: 'textbox', name: 'Password', sensitive: true });
		expect(target(registry, refOf('Email'))?.sensitive).toBe(false);
	});
});
