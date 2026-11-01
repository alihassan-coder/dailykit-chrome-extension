import { describe, expect, it } from 'vitest';
import { decide, isBlocked, siteOf, type Proposal } from '../src/policy.ts';

const base = { siteAllowed: false, runOrigins: new Set(['https://github.com']) };
const click = (name: string, url = 'https://shop.example.com/item'): Proposal => ({
	kind: 'click',
	url,
	target: { role: 'button', name, sensitive: false }
});

describe('blocked sites', () => {
	it('blocks banking, email, password managers and browser pages, including subdomains', () => {
		expect(isBlocked('https://www.paypal.com/myaccount')).toBe(true);
		expect(isBlocked('https://mail.google.com/mail/u/0')).toBe(true);
		expect(isBlocked('https://vault.bitwarden.com')).toBe(true);
		expect(isBlocked('chrome://settings')).toBe(true);
		expect(isBlocked('https://github.com')).toBe(false);
		expect(isBlocked('https://notpaypal.com')).toBe(false);
	});

	it('refuses any action on a blocked site and navigating to one', () => {
		expect(decide(click('Next', 'https://www.paypal.com/x'), base).verdict).toBe('refuse');
		const nav: Proposal = { kind: 'navigate', url: 'https://github.com', destination: 'https://mail.google.com' };
		expect(decide(nav, base).verdict).toBe('refuse');
	});
});

describe('never allowed, even if the user would approve', () => {
	it.each(['Place order', 'Buy now', 'Pay now', 'Proceed to checkout'])('refuses clicking "%s"', (name) => {
		expect(decide(click(name), { ...base, siteAllowed: true })).toMatchObject({ verdict: 'refuse' });
	});

	it('refuses creating accounts and permanent deletes', () => {
		expect(decide(click('Create account'), base).verdict).toBe('refuse');
		expect(decide(click('Delete forever'), base).verdict).toBe('refuse');
		expect(decide(click('Empty trash'), base).verdict).toBe('refuse');
	});

	it('refuses checkout pages and non-web addresses', () => {
		expect(
			decide({ kind: 'navigate', url: 'https://shop.com', destination: 'https://shop.com/checkout' }, base).verdict
		).toBe('refuse');
		expect(
			decide({ kind: 'navigate', url: 'https://shop.com', destination: 'javascript:alert(1)' }, base).verdict
		).toBe('refuse');
	});
});

describe('asking the user', () => {
	it('asks for ordinary actions until the site is allowed', () => {
		expect(decide(click('Next'), base)).toEqual({ verdict: 'ask', alwaysAsk: false, warnings: [] });
		expect(decide(click('Next'), { ...base, siteAllowed: true })).toEqual({ verdict: 'allow' });
	});

	it('always asks before typing into a sensitive field, even on an allowed site', () => {
		const typing: Proposal = {
			kind: 'type',
			url: 'https://github.com/login',
			text: 'secret',
			target: { role: 'textbox', name: 'Password', sensitive: true }
		};
		expect(decide(typing, { ...base, siteAllowed: true })).toMatchObject({ verdict: 'ask', alwaysAsk: true });
	});

	it('always asks before opening a new site or a sign-in page', () => {
		const nav: Proposal = {
			kind: 'navigate',
			url: 'https://github.com',
			destination: 'https://accounts.google.com/o/oauth2'
		};
		const d = decide(nav, { ...base, siteAllowed: true });
		expect(d).toMatchObject({ verdict: 'ask', alwaysAsk: true });
		expect(d.verdict === 'ask' && d.warnings).toHaveLength(2);
	});
});

describe('siteOf', () => {
	it('keys "always allow" by the site, not the subdomain', () => {
		expect(siteOf('https://gist.github.com/x')).toBe('github.com');
		expect(siteOf('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
		expect(siteOf('http://localhost:3000')).toBe('localhost');
	});
});
