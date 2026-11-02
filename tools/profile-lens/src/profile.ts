// What Profile lens reads from LinkedIn, and how. Two sources, merged: the structured data LinkedIn already
// embeds in the page (parsed in structured.ts) and the visible page, captured per section (its text, keyed by
// heading, plus each list item's lines) instead of by class names, which LinkedIn changes often. Only the
// functions marked "runs inside the LinkedIn tab" are injected; everything else is plain logic.
import { AppFailure, appError, type AppError } from '@toolbelt/core';
import {
	cleanLine,
	computeFacts,
	emptyStructured,
	fromEmbedded,
	fromLdJson,
	fromPage,
	listKind,
	mergeStructured,
	structuredText,
	type StructuredProfile
} from './structured.ts';

export type PageKind = 'profile' | 'details' | 'posts';

/** One list on the page: a section heading and its items, each item as its visible lines. */
export interface PageList {
	heading: string;
	items: string[][];
}

/** What one LinkedIn page gave us, before cleaning. */
export interface PageCapture {
	url: string;
	/** The page's main heading: the person's name on a profile. */
	heading: string;
	photo: string | null;
	sections: { heading: string; text: string }[];
	/** All text in the main column, for detail and activity pages that have no sections. */
	text: string;
	/** Full-list pages the profile links to ("Show all 12 experiences" → "experience"). */
	detailLinks: string[];
	/** How many entries each full list has, when the link says ("Show all 12 experiences" → 12). */
	detailCounts?: Record<string, number>;
	/** Section lists, item by item. */
	lists?: PageList[];
	/** JSON LinkedIn embeds in <code> elements (signed-in pages). */
	embedded?: string[];
	/** schema.org blocks (<script type="application/ld+json">). */
	ldJson?: string[];
	/** The top card's lines: name, pronouns, headline, location, "Contact info", counts. */
	topCard?: string[];
	/** The page had fully drawn (the name and its sections) when it was read. */
	ready?: boolean;
	/** LinkedIn showed its sign-in wall (or the signed-out public view) instead of the page. */
	signedOut: boolean;
	/** LinkedIn showed "This page doesn't exist" or similar. */
	missing: boolean;
}

/** A quick look at the tab: is the page there yet? */
export interface PageProbe {
	url: string;
	ready: boolean;
	signedOut: boolean;
	missing: boolean;
}

export interface ProfileSnapshot {
	slug: string;
	url: string;
	name: string;
	photo: string | null;
	/** The top card: headline, location, connections, current company and school. */
	intro: string;
	connections: string | null;
	followers: string | null;
	/** Section heading → cleaned text, e.g. "About", "Experience", "Licenses & certifications". */
	sections: Record<string, string>;
	posts: string;
	capturedAt: number;
	/** Parts that could not be read this time ("Skills", "Recent posts"). Missing on older snapshots. */
	gaps?: string[];
	/** Roles with dates, schools, skills: from LinkedIn's embedded data first, then the page. Missing on older snapshots. */
	structured?: StructuredProfile;
}

export type ProfileProblem =
	'not-linkedin' | 'not-profile' | 'signed-out' | 'missing' | 'empty' | 'stale' | 'slow' | 'load-failed' | 'no-access';

export const PROBLEMS: Record<ProfileProblem, string> = {
	'not-linkedin': 'Open a LinkedIn profile, then press Analyze.',
	'not-profile': 'Open a LinkedIn profile, then press Analyze.',
	'signed-out': 'LinkedIn only shows full profiles when you’re signed in. Sign in, then press Analyze again.',
	missing: 'This profile isn’t available. It may be private, removed, or the link may be wrong.',
	empty:
		'Toolbelt waited and reloaded the page once, but the profile still didn’t appear. Check the tab, then try again.',
	stale: 'LinkedIn kept showing another page. Open the profile again, then try again.',
	slow: 'The page didn’t finish loading within 15 seconds. Check your connection, then try again.',
	'load-failed': 'The tab shows an error page instead of LinkedIn. Check your connection, then try again.',
	'no-access': 'Allow Toolbelt to read linkedin.com, so Profile lens can read the profile you’re viewing.'
};

function problemError(problem: ProfileProblem): AppError {
	const message = PROBLEMS[problem];
	const retry = { label: 'Try again', kind: 'retry' } as const;
	switch (problem) {
		case 'not-linkedin':
		case 'not-profile':
			return appError('linkedin_missing', {}, { title: 'Open a LinkedIn profile', message, severity: 'info' });
		case 'signed-out':
			return appError('linkedin_signed_out', {}, { message });
		case 'missing':
			return appError('linkedin_missing', {}, { message });
		case 'empty':
			return appError(
				'unknown',
				{},
				{ title: 'LinkedIn didn’t finish loading', message, severity: 'warn', action: retry }
			);
		case 'stale':
			return appError('tab_gone', {}, { title: 'The tab showed another page', message });
		case 'slow':
			return appError(
				'unknown',
				{},
				{ title: 'LinkedIn is taking too long', message, severity: 'warn', action: retry }
			);
		case 'load-failed':
			return appError('offline', {}, { title: 'LinkedIn didn’t load', message, action: retry });
		case 'no-access':
			return appError(
				'no_host_access',
				{},
				{
					title: 'Allow access to LinkedIn',
					message,
					action: { label: 'Allow on LinkedIn', kind: 'grant-access' }
				}
			);
	}
}

/** A reading failure, carrying its AppError (so describeError shows the right words) and the problem. */
export class ProfileError extends AppFailure {
	constructor(readonly problem: ProfileProblem) {
		super(problemError(problem));
		this.name = 'ProfileError';
	}
}

const linkedInHost = (u: URL) => u.protocol === 'https:' && /(^|\.)linkedin\.com$/.test(u.hostname);
const parse = (url: string | undefined) => {
	try {
		return url ? new URL(url) : null;
	} catch {
		return null;
	}
};

/** The profile's handle from a LinkedIn URL ("https://www.linkedin.com/in/jane-doe-12/" → "jane-doe-12"). */
export function profileSlug(url: string | undefined): string | null {
	const u = parse(url);
	if (!u || !linkedInHost(u)) return null;
	const m = /^\/in\/([^/]+)\/?/.exec(u.pathname);
	if (!m) return null;
	try {
		return decodeURIComponent(m[1]!);
	} catch {
		return null;
	}
}

export const isLinkedIn = (url: string | undefined) => {
	const u = parse(url);
	return !!u && linkedInHost(u);
};

/** LinkedIn's sign-in wall and login pages: the tab isn't on a profile because LinkedIn wants you signed in. */
export function isSignInUrl(url: string | undefined): boolean {
	const u = parse(url);
	return (
		!!u && linkedInHost(u) && /^\/(authwall|login|checkpoint|signup|uas\/login|uas\/authenticate)/.test(u.pathname)
	);
}

/** True on the profile page itself, not one of its sub-pages (/details/…, /recent-activity/…, /overlay/…). */
export function isMainProfilePage(url: string | undefined, slug: string): boolean {
	return profileSlug(url) === slug && /^\/in\/[^/]+\/?$/.test(parse(url)!.pathname);
}

export const profileUrl = (slug: string) => `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`;

/** Full lists LinkedIn moves to their own pages when they are long; the profile page then shows only a few. */
export const DETAIL_PAGES = [
	{ id: 'experience', heading: 'Experience' },
	{ id: 'education', heading: 'Education' },
	{ id: 'certifications', heading: 'Licenses & certifications' },
	{ id: 'skills', heading: 'Skills' },
	{ id: 'projects', heading: 'Projects' },
	{ id: 'honors', heading: 'Honors & awards' },
	{ id: 'languages', heading: 'Languages' },
	{ id: 'recommendations', heading: 'Recommendations' }
] as const;

export const detailUrl = (slug: string, id: string) => `${profileUrl(slug)}details/${id}/`;
export const postsUrl = (slug: string) => `${profileUrl(slug)}recent-activity/all/`;

/**
 * Runs inside the LinkedIn tab, so it must be self-contained. Says at once whether the page is ready to read:
 * on the right profile, with its name and sections drawn (or the person in LinkedIn's embedded data), or showing
 * the sign-in wall or a "page doesn't exist" message. Reads nothing else and changes nothing.
 */
export function probePage(kind: PageKind, slug: string): PageProbe {
	const textOf = (el: Element | null) => (el ? ((el as HTMLElement).innerText ?? el.textContent ?? '') : '');
	const path = location.pathname.toLowerCase();
	const onSlug =
		path.includes(`/in/${slug.toLowerCase()}`) || path.includes(`/in/${encodeURIComponent(slug).toLowerCase()}`);
	const main = document.querySelector('main');
	const name = textOf(document.querySelector('main h1, h1')).trim();
	const wallText = name ? '' : textOf(main ?? document.body);
	const guest =
		!document.querySelector('#global-nav, .global-nav') &&
		!!document.querySelector('[data-tracking-control-name^="public_profile"], .authwall-join-form, form.join-form');
	const signedOut =
		/\/(authwall|login|checkpoint|signup)/.test(location.pathname) ||
		!!document.querySelector('[data-test-id*="authwall"], .authwall-join-form, #join-form') ||
		guest ||
		/Sign in to view|Join now to see/i.test(wallText);
	const missing = /This page doesn.t exist|Profile not found|This profile is not available/i.test(wallText);
	let ready = false;
	if (onSlug) {
		if (kind === 'profile') {
			// The name plus its sections; or, should LinkedIn stop using <section>, the name plus a page of text.
			const drawn =
				!!name &&
				((main?.querySelectorAll('section').length ?? 0) >= 2 || (main?.textContent ?? '').trim().length > 600);
			const embedded = [...document.querySelectorAll('code')].some((c) =>
				(c.textContent ?? '').includes(`"publicIdentifier":"${slug}"`)
			);
			ready = drawn || (!!name && embedded);
		} else ready = !!main && (main.querySelectorAll('li').length > 0 || textOf(main).trim().length > 80);
	}
	return { url: location.href, ready, signedOut, missing };
}

/**
 * Runs inside the LinkedIn tab via scripting.executeScript, so it must be self-contained: no imports, no
 * outside helpers. Waits briefly until the single-page app shows the right profile, scrolls until lazy parts
 * stop loading, opens "see more" texts, then returns what is on screen plus the structured data LinkedIn embeds.
 * Clicking "see more" only expands text in place; it never follows a link or changes anything.
 */
export async function capturePage(kind: PageKind, slug?: string, maxWaitMs = 3_000): Promise<PageCapture> {
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const textOf = (el: Element | null) => (el ? ((el as HTMLElement).innerText ?? el.textContent ?? '') : '');
	const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
	// "ExperienceExperience" and "Experience Experience": the visible heading plus its screen-reader copy.
	const heading = (raw: string) => {
		const t = squash(raw);
		const half = t.length / 2;
		if (Number.isInteger(half) && t.slice(0, half) === t.slice(half)) return t.slice(0, half);
		const words = t.split(' ');
		const w = words.length / 2;
		if (Number.isInteger(w) && words.slice(0, w).join(' ') === words.slice(w).join(' '))
			return words.slice(0, w).join(' ');
		return t;
	};
	const onSlug = () => {
		if (!slug) return true;
		const path = location.pathname.toLowerCase();
		return path.includes(`/in/${slug.toLowerCase()}`) || path.includes(`/in/${encodeURIComponent(slug).toLowerCase()}`);
	};
	const drawn = () =>
		onSlug() &&
		(kind !== 'profile' ||
			(!!textOf(document.querySelector('main h1, h1')).trim() &&
				((document.querySelector('main')?.querySelectorAll('section').length ?? 0) >= 2 ||
					(document.querySelector('main')?.textContent ?? '').trim().length > 600)));

	// LinkedIn swaps pages without a reload: wait (briefly; the reader already waited) for the page to arrive.
	for (let waited = 0; waited < maxWaitMs && !drawn(); waited += 250) await wait(250);

	// Scroll until the page stops growing (lazy sections), with a cap.
	const maxRounds = kind === 'posts' ? 6 : 8;
	let height = -1;
	for (let i = 0; i < maxRounds && document.body.scrollHeight !== height; i++) {
		height = document.body.scrollHeight;
		window.scrollTo(0, height);
		await wait(700);
	}

	const main = document.querySelector('main') ?? document.body;
	for (const button of main.querySelectorAll('button')) {
		if (button.closest('a')) continue;
		const label = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`.toLowerCase();
		const inShowMore = !!button.closest('[class*="show-more"], [class*="see-more"]');
		if (/see more|show more/.test(label) || (inShowMore && button.getAttribute('aria-expanded') === 'false'))
			button.click();
	}
	await wait(300);
	window.scrollTo(0, 0);

	/** Each top-level list item's lines: LinkedIn's visible copies (aria-hidden) when it has them, else its text. */
	const itemsOf = (root: Element): string[][] =>
		[...root.querySelectorAll('li')]
			.filter((li) => {
				const outer = li.parentElement?.closest('li');
				return !outer || !root.contains(outer);
			})
			.slice(0, 120)
			.map((li) => {
				const spans = [...li.querySelectorAll('span[aria-hidden="true"]')].filter(
					(s) => !s.parentElement?.closest('span[aria-hidden="true"]')
				);
				const raw = spans.length ? spans.map((s) => textOf(s)) : textOf(li).split('\n');
				const lines: string[] = [];
				for (const r of raw.flatMap((t) => t.split('\n'))) {
					const t = squash(r);
					if (t && t !== lines.at(-1)) lines.push(t);
				}
				return lines.slice(0, 40);
			})
			.filter((lines) => lines.length > 0);

	const sectionEls = [...main.querySelectorAll('section')];
	const sections = sectionEls
		.map((section) => ({ heading: heading(textOf(section.querySelector('h2'))), text: textOf(section) }))
		.filter((s) => s.heading && s.text.trim());
	const lists = sectionEls
		.map((section) => ({ heading: heading(textOf(section.querySelector('h2, h1'))), items: itemsOf(section) }))
		.filter((l) => l.items.length > 0);
	if (!lists.length && kind !== 'profile') lists.push({ heading: '', items: itemsOf(main) });

	const photo =
		[...main.querySelectorAll('img')].find((img) => /profile-displayphoto|profile-framedphoto/.test(img.src))?.src ??
		null;
	const detailCounts: Record<string, number> = {};
	for (const a of main.querySelectorAll('a[href*="/details/"]')) {
		const id = /\/details\/([a-z-]+)/.exec((a as HTMLAnchorElement).href)?.[1];
		const n = /(\d[\d,.]*)/.exec(textOf(a))?.[1];
		if (id && n) detailCounts[id] = Math.max(detailCounts[id] ?? 0, Number(n.replace(/[,.]/g, '')));
	}
	const detailLinks = [
		...new Set(
			[...main.querySelectorAll('a[href*="/details/"]')]
				.map((a) => /\/details\/([a-z-]+)/.exec((a as HTMLAnchorElement).href)?.[1])
				.filter((id): id is string => !!id)
		)
	];
	// The page's own data, read as text: no requests. Capped so a huge page can't flood the panel.
	const embedded: string[] = [];
	let budget = 4_000_000;
	for (const code of document.querySelectorAll('code')) {
		const t = code.textContent ?? '';
		if (t.length < 50 || t.length > budget || !/^\s*[{[]/.test(t) || !t.includes('$type')) continue;
		embedded.push(t);
		budget -= t.length;
	}
	const ldJson = [...document.querySelectorAll('script[type="application/ld+json"]')]
		.map((s) => s.textContent ?? '')
		.filter((t) => t.trim() && t.length < 500_000);

	const name = textOf(main.querySelector('h1')).trim();
	// The top card line by line (name, pronouns, headline, location...): each text-only element is one line.
	const card = main.querySelector('h1')?.closest('section') ?? null;
	const topCard: string[] = [];
	for (const el of card ? [...card.querySelectorAll('*')] : []) {
		if (el.children.length || el.closest('button, [class*="visually-hidden"], .sr-only')) continue;
		const t = squash(textOf(el));
		if (t && t !== topCard.at(-1)) topCard.push(t);
	}
	// Wall and "missing" wording is only trusted when the page has no profile heading: a post quoting
	// "Join now" must not read as a sign-in wall.
	const wallText = name ? '' : textOf(main);
	const guest =
		!document.querySelector('#global-nav, .global-nav') &&
		!!document.querySelector('[data-tracking-control-name^="public_profile"], .authwall-join-form, form.join-form');

	return {
		url: location.href,
		heading: name,
		photo,
		sections,
		text: textOf(main),
		detailLinks,
		detailCounts,
		lists,
		embedded,
		ldJson,
		topCard: topCard.slice(0, 30),
		ready: drawn(),
		signedOut:
			/\/(authwall|login|checkpoint|signup)/.test(location.pathname) ||
			!!document.querySelector('[data-test-id*="authwall"], .authwall-join-form, form.join-form, #join-form') ||
			guest ||
			/Sign in to view|Join now to see/i.test(wallText),
		missing: /This page doesn.t exist|Profile not found|This profile is not available/i.test(wallText)
	};
}

/** A profile the user could mean, found on a LinkedIn page that isn't a profile (search, feed, messaging). */
export interface ProfileLink {
	slug: string;
	name: string;
}

/**
 * Runs inside the LinkedIn tab (self-contained). Lists the profiles linked from the page's main column, the
 * selected or open one first (an open message thread, a selected search result). Leaves out the viewer's own
 * card. Reads links only; changes nothing.
 */
export function findProfileLinks(): ProfileLink[] {
	const root = document.querySelector('main') ?? document.body;
	const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
	const preferred = [
		'[aria-current="true"] a[href*="/in/"]',
		'[aria-current="page"] a[href*="/in/"]',
		'[aria-selected="true"] a[href*="/in/"]',
		'[class*="--active"] a[href*="/in/"]',
		'[class*="selected"] a[href*="/in/"]',
		'[class*="thread"] header a[href*="/in/"]',
		'[class*="profile-card"] a[href*="/in/"]'
	].join(', ');
	const own = '.feed-identity-module, [class*="identity-module"], [class*="global-nav"]';
	const links = [
		...root.querySelectorAll<HTMLAnchorElement>(preferred),
		...root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')
	];
	const found = new Map<string, string>();
	for (const a of links) {
		if (a.closest(own)) continue;
		const m = /linkedin\.com\/in\/([^/?#]+)/.exec(a.href) ?? /^\/in\/([^/?#]+)/.exec(a.getAttribute('href') ?? '');
		if (!m) continue;
		let slug: string;
		try {
			slug = decodeURIComponent(m[1]!);
		} catch {
			continue;
		}
		const visible = a.querySelector('span[aria-hidden="true"]');
		let name = squash((visible ?? a).textContent ?? '')
			.replace(/^View\s+|[’']s?\s+profile.*$/gi, '')
			.replace(/\s*•.*$/, '');
		const half = name.length / 2;
		if (Number.isInteger(half) && half > 1 && name.slice(0, half) === name.slice(half)) name = name.slice(0, half);
		name = name.length > 60 ? '' : name;
		if (!found.has(slug)) found.set(slug, name);
		else if (!found.get(slug) && name) found.set(slug, name);
		if (found.size >= 8) break;
	}
	return [...found].map(([slug, name]) => ({ slug, name })).slice(0, 5);
}

/** Collapses whitespace and drops an exactly repeated half ("ExperienceExperience" → "Experience"). */
export function cleanHeading(raw: string): string {
	const t = raw.replace(/\s+/g, ' ').trim();
	const half = t.length / 2;
	if (Number.isInteger(half) && half > 0 && t.slice(0, half) === t.slice(half)) return t.slice(0, half);
	const words = t.split(' ');
	const w = words.length / 2;
	if (Number.isInteger(w) && w > 0 && words.slice(0, w).join(' ') === words.slice(w).join(' '))
		return words.slice(0, w).join(' ');
	return t;
}

// LinkedIn's buttons and screen-reader copies of text that add nothing for the AI.
const NOISE =
	/^(…?\s*see more|see less|show all.*|show more|show less|follow|following|message|connect|more|pending|like|comment|repost|send|show translation|see translation|·|•|\d+ (likes?|comments?|reposts?)|load more comments)$/i;

/**
 * Trims lines, drops empty and noise lines, removes LinkedIn's doubled lines (visible + screen-reader copy, as
 * two lines or glued into one) and cuts very long text.
 */
export function cleanText(raw: string, maxChars = 12_000): string {
	const out: string[] = [];
	for (const line of raw.split('\n')) {
		const t = cleanLine(line);
		if (!t || NOISE.test(t) || t === out.at(-1)) continue;
		out.push(t);
	}
	const text = out.join('\n');
	return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…cut for length]` : text;
}

/** Drops the section's own title from the top of its text (LinkedIn repeats it for screen readers). */
function withoutHeading(text: string, heading: string): string {
	const lines = text.split('\n');
	while (lines.length && cleanHeading(lines[0]!) === heading) lines.shift();
	return lines.join('\n');
}

const COUNT = (label: string) => new RegExp(`([\\d.,]+\\+?[KkMm]?)\\s+${label}`);

/** The structured profile from everything the read captured: embedded data first, the visible lists after. */
export function structuredFrom(
	slug: string,
	profile: PageCapture,
	details: { heading: string; capture: PageCapture }[] = [],
	intro = '',
	about?: string
): StructuredProfile {
	const embedded = fromEmbedded(
		[profile, ...details.map((d) => d.capture)].flatMap((c) => c.embedded ?? []),
		slug
	);
	const ld = fromLdJson(profile.ldJson ?? [], slug);
	// A detail page's biggest list is the full version of its section.
	const detailLists = details.flatMap(({ heading, capture }) => {
		const biggest = [...(capture.lists ?? [])].sort((a, b) => b.items.length - a.items.length)[0];
		return biggest ? [{ heading, items: biggest.items }] : [];
	});
	const page = fromPage([...(profile.lists ?? []), ...detailLists]);
	// The top card: name, then the headline; the location is the short line with a comma before "Contact info".
	const introLines = (profile.topCard?.length ? profile.topCard : intro.split('\n'))
		.map(cleanLine)
		.filter((l) => l && l !== profile.heading);
	page.name = profile.heading || undefined;
	page.headline = introLines.find((l) => !/^(he|she|they)\/(him|her|them)$/i.test(l) && l.length > 3);
	const contact = introLines.findIndex((l) => /^contact info$/i.test(l));
	const afterHeadline = introLines.indexOf(page.headline ?? '') + 1;
	page.location = (contact > 0 ? introLines.slice(afterHeadline, contact) : introLines.slice(afterHeadline))
		.filter((l) => /,/.test(l) && l.length < 80 && !/connections|followers|·/i.test(l))
		.at(-1);
	page.about = about;
	return mergeStructured(embedded, ld, page);
}

/** Puts the captured pages together into one snapshot of the person. */
export function buildSnapshot(
	slug: string,
	profile: PageCapture,
	details: { heading: string; capture: PageCapture }[],
	posts: PageCapture | null,
	now = Date.now(),
	gaps: string[] = []
): ProfileSnapshot {
	if (profile.signedOut) throw new ProfileError('signed-out');
	if (profile.missing) throw new ProfileError('missing');
	const fromData = fromEmbedded(profile.embedded ?? [], slug);
	if (!profile.heading && !fromData?.name) throw new ProfileError('empty');

	const sections: Record<string, string> = {};
	let intro = '';
	const name = profile.heading || fromData!.name!;
	for (const s of profile.sections) {
		const heading = cleanHeading(s.heading);
		const text = withoutHeading(cleanText(s.text, 6_000), heading);
		// The top card is the section that holds the name; it has no heading of its own worth keeping.
		if (!intro && s.text.includes(name)) intro = cleanText(s.text, 2_000);
		else if (text && heading) sections[heading] = text;
	}
	for (const d of details) {
		if (d.capture.signedOut || d.capture.missing) continue;
		const text = withoutHeading(cleanText(d.capture.text), d.heading);
		// The full list replaces the shortened one from the profile page, when it has more.
		if (text && text.length > (sections[d.heading]?.length ?? 0)) sections[d.heading] = text;
	}
	const allText = `${intro}\n${profile.text}`;
	const structured = structuredFrom(slug, profile, details, intro, sections.About);
	return {
		slug,
		url: profileUrl(slug),
		name,
		photo: profile.photo,
		intro,
		connections: COUNT('connections').exec(allText)?.[1] ?? null,
		followers: COUNT('followers').exec(allText)?.[1] ?? null,
		sections,
		posts: posts && !posts.signedOut ? cleanText(posts.text, 10_000) : '',
		capturedAt: now,
		gaps,
		structured
	};
}

/** A tag the profile text cannot close by itself: random per call, so "</linkedin_profile>" in a bio is just text. */
export const profileTag = () => `linkedin_profile_${Math.random().toString(36).slice(2, 10)}`;

/** The profile's text as the AI reads it, without the marking tags: also what evidence quotes are checked against. */
export function snapshotBody(p: ProfileSnapshot, now = new Date()): string {
	const s = p.structured ?? emptyStructured();
	const facts = computeFacts(s, now);
	const parsed = structuredText(s, facts);
	// A raw list section adds nothing when LinkedIn's own data already gave the full list.
	const covered = (heading: string) => {
		const kind = listKind(heading.toLowerCase());
		return !!kind && s.sources[kind] === 'embedded' && s[kind].length > 0;
	};
	const parts = [
		`Name: ${p.name}`,
		`Profile: ${p.url}`,
		p.connections && `Connections: ${p.connections}`,
		p.followers && `Followers: ${p.followers}`,
		parsed && `## Parsed from LinkedIn's page data\n${parsed}`,
		p.intro && `## Intro\n${p.intro}`,
		!p.sections?.About && s.about && `## About\n${s.about}`,
		...Object.entries(p.sections ?? {})
			.filter(([h]) => !covered(h))
			.map(([h, t]) => `## ${h}\n${t}`),
		p.posts && `## Recent activity and posts\n${p.posts}`
	].filter(Boolean);
	return parts.join('\n\n');
}

/** The snapshot as one block of text for the AI, clearly marked as data rather than instructions. */
export function snapshotText(p: ProfileSnapshot, tag = profileTag(), now = new Date()): string {
	const body = snapshotBody(p, now).replaceAll(tag, '');
	return `<${tag}>\n${body}\n</${tag}>`;
}
