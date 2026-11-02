// The agent's safety rules, enforced in code, not only in the prompt. Every action the model proposes goes
// through decide(): some are refused outright, some always need the user's OK, the rest need it unless the
// user allowed this site.

export type ActionKind = 'click' | 'type' | 'form_input' | 'key' | 'scroll' | 'navigate';

export interface Proposal {
	kind: ActionKind;
	/** Page the action happens on. */
	url: string;
	/** For navigate: where to. */
	destination?: string;
	/**
	 * The element, as the page describes it. For key presses this is the focused element, because that is
	 * what the keys act on. `submitName` is the visible name of the submit button of the element's form.
	 */
	target?: { role: string; name: string; sensitive: boolean; text?: string; submitName?: string };
	/** For type / form_input. */
	text?: string;
	/** For key: the keys pressed. */
	keys?: string;
	/** The action submits a form (type with submit, or Enter in a form field). Treated as clicking its submit button. */
	submit?: boolean;
}

export type Decision =
	| { verdict: 'refuse'; reason: string }
	| { verdict: 'ask'; alwaysAsk: boolean; warnings: string[] }
	| { verdict: 'allow' };

/** Sites the agent may not read or act on at all. Matched on the hostname and its subdomains. */
export const DEFAULT_BLOCKED_SITES = [
	// Banking, payments and crypto
	'paypal.com',
	'dashboard.stripe.com',
	'chase.com',
	'bankofamerica.com',
	'wellsfargo.com',
	'citi.com',
	'hsbc.com',
	'barclays.co.uk',
	'revolut.com',
	'wise.com',
	'coinbase.com',
	'binance.com',
	'kraken.com',
	// Email
	'mail.google.com',
	'outlook.live.com',
	'outlook.office.com',
	'mail.yahoo.com',
	'proton.me',
	'icloud.com',
	// Password managers
	'1password.com',
	'bitwarden.com',
	'lastpass.com',
	'dashlane.com'
];

const host = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export function isBlocked(url: string, blocked: string[] = DEFAULT_BLOCKED_SITES): boolean {
	if (!isWebUrl(url)) return true; // chrome://, about:, file:, extension pages
	const h = host(url);
	return blocked.some((site) => h === site || h.endsWith(`.${site}`));
}

// Pages no extension can script: browser pages, other extensions, the stores, local files and the PDF viewer.
const BROWSER_SCHEME =
	/^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|moz-extension|extension|devtools|view-source|chrome-search|chrome-untrusted|file|data|blob|javascript):/i;
const STORE =
	/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)(\/|$)/i;

export function isRestricted(url: string): boolean {
	if (!url) return false;
	if (BROWSER_SCHEME.test(url) || STORE.test(url)) return true;
	try {
		return /\.pdf$/i.test(new URL(url).pathname);
	} catch {
		return true;
	}
}

/**
 * Whether the agent can work on a tab. A tab whose address is empty is one Toolbelt has no access to: without
 * host permission the browser hides the address from extensions.
 */
export type PageAccess = 'ok' | 'no-access' | 'restricted' | 'blocked';

export function pageAccess(url: string): PageAccess {
	if (!url) return 'no-access';
	if (isRestricted(url)) return 'restricted';
	if (isBlocked(url)) return 'blocked';
	return 'ok';
}

// Second-level suffixes where the registrable domain has three labels (example.co.uk).
const TWO_PART_SUFFIXES = new Set([
	'co.uk',
	'org.uk',
	'ac.uk',
	'com.au',
	'net.au',
	'co.jp',
	'com.br',
	'co.in',
	'com.pk',
	'co.nz',
	'com.mx'
]);

/** "app.github.com" -> "github.com"; what "always allow on this site" is keyed by. */
export function siteOf(url: string): string {
	const labels = host(url).split('.').filter(Boolean);
	if (labels.length <= 2) return labels.join('.');
	const lastTwo = labels.slice(-2).join('.');
	return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

const PURCHASE =
	/\b(place (your )?order|buy now|pay now|purchase|complete (the )?purchase|confirm (and )?pay(ment)?|checkout|check out)\b/i;
const ACCOUNT_CREATION = /\b(create (an |your |new )?account|sign up|register)\b/i;
const PERMANENT_DELETE =
	/\b(delete (forever|permanently|account|my account)|permanently delete|empty (the )?trash|erase all)\b/i;
const CHECKOUT_PATH = /\/(checkout|cart\/pay|payment)(\/|$|\?)/i;
const AUTH_GRANT = /(accounts\.google\.com|login\.microsoftonline\.com|\/oauth|\/authorize)/i;
/** Keys that activate the focused element (press a button, follow a link, submit a form). */
const activates = (keys = '') =>
	keys.split(/[\s+]+/).some((k) => ['enter', 'return', 'space', 'spacebar'].includes(k.toLowerCase()));

/** The names an action could "press": the element itself, and the submit button when it submits a form. */
function pressedNames(p: Proposal): string[] {
	const t = p.target;
	const names = [t?.name, t?.text];
	if (p.submit) names.push(t?.submitName);
	return names.filter((n): n is string => Boolean(n));
}

export function decide(p: Proposal, opts: { siteAllowed: boolean; runOrigins: Set<string> }): Decision {
	if (p.kind === 'navigate') {
		const to = p.destination ?? '';
		if (!isWebUrl(to)) return { verdict: 'refuse', reason: 'Only http and https pages can be opened.' };
		if (isBlocked(to)) return { verdict: 'refuse', reason: `${host(to)} is on the blocked list.` };
		if (CHECKOUT_PATH.test(to))
			return { verdict: 'refuse', reason: 'The agent does not open checkout or payment pages.' };
	}
	if (isBlocked(p.url)) return { verdict: 'refuse', reason: `${host(p.url) || 'This page'} is on the blocked list.` };

	const keyActivates = p.kind === 'key' && activates(p.keys);
	const presses = p.kind === 'click' || keyActivates || p.submit === true;
	if (presses || p.kind === 'form_input') {
		const names = pressedNames(p);
		if (names.some((n) => PURCHASE.test(n)) || (presses && CHECKOUT_PATH.test(p.url))) {
			return { verdict: 'refuse', reason: 'The agent never buys or pays for anything. Do this step yourself.' };
		}
		if (presses && names.some((n) => ACCOUNT_CREATION.test(n)))
			return { verdict: 'refuse', reason: 'The agent does not create accounts.' };
		if (names.some((n) => PERMANENT_DELETE.test(n)))
			return { verdict: 'refuse', reason: 'The agent does not delete things permanently.' };
	}

	const warnings: string[] = [];
	if ((p.kind === 'type' || p.kind === 'form_input') && p.target?.sensitive) {
		warnings.push('This is a password, payment or one-time-code field.');
	}
	if (p.submit) {
		warnings.push(p.target?.submitName ? `Submits the form (“${p.target.submitName}”).` : 'Submits the form.');
	}
	if (p.kind === 'navigate' && p.destination) {
		const origin = new URL(p.destination).origin;
		if (!opts.runOrigins.has(origin)) warnings.push(`Opens a new site: ${host(p.destination)}.`);
		if (AUTH_GRANT.test(p.destination)) warnings.push('This looks like a sign-in or permission page.');
	}

	if (warnings.length) return { verdict: 'ask', alwaysAsk: true, warnings };
	if (opts.siteAllowed) return { verdict: 'allow' };
	return { verdict: 'ask', alwaysAsk: false, warnings };
}
