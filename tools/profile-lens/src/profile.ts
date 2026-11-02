// What Profile lens reads from LinkedIn, and how. LinkedIn changes its markup often, so we capture each
// section's visible text (keyed by its heading) instead of relying on class names, clean it here, and let
// the AI turn it into facts. Only `capturePage` runs inside the LinkedIn tab; everything else is plain logic.
import { AppFailure, appError, type AppError } from '@toolbelt/core';

export type PageKind = 'profile' | 'details' | 'posts';

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
	/** LinkedIn showed its sign-in wall instead of the page. */
	signedOut: boolean;
	/** LinkedIn showed "This page doesn't exist" or similar. */
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
}

export type ProfileProblem = 'not-profile' | 'signed-out' | 'missing' | 'empty' | 'stale';

export const PROBLEMS: Record<ProfileProblem, string> = {
	'not-profile': 'Open someone’s LinkedIn profile (linkedin.com/in/…) in this tab, then try again.',
	'signed-out': 'LinkedIn is asking you to sign in. Sign in to LinkedIn in this browser, then try again.',
	missing: 'This profile isn’t available. It may be private, removed, or the link may be wrong.',
	empty: 'The profile didn’t finish loading. Scroll the page once, then try again.',
	stale: 'LinkedIn was still showing another page. Open the profile again, then try again.'
};

function problemError(problem: ProfileProblem): AppError {
	switch (problem) {
		case 'not-profile':
			return appError('linkedin_missing', {}, { title: 'Open a LinkedIn profile', message: PROBLEMS[problem] });
		case 'signed-out':
			return appError('linkedin_signed_out');
		case 'missing':
			return appError('linkedin_missing');
		case 'empty':
			return appError(
				'unknown',
				{},
				{
					title: 'The profile didn’t finish loading',
					message: 'Scroll the page once, then try again.',
					severity: 'warn'
				}
			);
		case 'stale':
			return appError('tab_gone', {}, { title: 'The tab showed another page', message: PROBLEMS[problem] });
	}
}

/** A reading failure, carrying its AppError (so describeError shows the right words) and the problem. */
export class ProfileError extends AppFailure {
	constructor(readonly problem: ProfileProblem) {
		super(problemError(problem));
		this.name = 'ProfileError';
	}
}

/** The profile's handle from a LinkedIn URL ("https://www.linkedin.com/in/jane-doe-12/" → "jane-doe-12"). */
export function profileSlug(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		if (u.protocol !== 'https:' || !/(^|\.)linkedin\.com$/.test(u.hostname)) return null;
		const m = /^\/in\/([^/]+)\/?/.exec(u.pathname);
		return m ? decodeURIComponent(m[1]!) : null;
	} catch {
		return null;
	}
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
 * Runs inside the LinkedIn tab via scripting.executeScript, so it must be self-contained: no imports, no
 * outside helpers. Waits until the single-page app shows the right profile, scrolls until lazy parts stop
 * loading, opens "see more" texts, then returns what is on screen. Clicking "see more" only expands text
 * in place; it never follows a link or changes anything.
 */
export async function capturePage(kind: PageKind, slug?: string): Promise<PageCapture> {
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const textOf = (el: Element | null) => (el ? ((el as HTMLElement).innerText ?? el.textContent ?? '') : '');
	// "ExperienceExperience" and "Experience Experience": the visible heading plus its screen-reader copy.
	const heading = (raw: string) => {
		const t = raw.replace(/\s+/g, ' ').trim();
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

	// LinkedIn swaps pages without a reload: wait (up to 5 s) for the URL, and on a profile its name, to arrive.
	for (let waited = 0; waited < 5_000; waited += 250) {
		if (onSlug() && (kind !== 'profile' || textOf(document.querySelector('main h1, h1')).trim())) break;
		await wait(250);
	}

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

	const sections = [...main.querySelectorAll('section')]
		.map((section) => ({ heading: heading(textOf(section.querySelector('h2'))), text: textOf(section) }))
		.filter((s) => s.heading && s.text.trim());
	const photo =
		[...main.querySelectorAll('img')].find((img) => /profile-displayphoto|profile-framedphoto/.test(img.src))?.src ??
		null;
	const detailLinks = [
		...new Set(
			[...main.querySelectorAll('a[href*="/details/"]')]
				.map((a) => /\/details\/([a-z-]+)/.exec((a as HTMLAnchorElement).href)?.[1])
				.filter((id): id is string => !!id)
		)
	];
	const name = textOf(main.querySelector('h1')).trim();
	// Wall and "missing" wording is only trusted when the page has no profile heading: a post quoting
	// "Join now" must not read as a sign-in wall.
	const wallText = name ? '' : textOf(main);

	return {
		url: location.href,
		heading: name,
		photo,
		sections,
		text: textOf(main),
		detailLinks,
		signedOut:
			/\/(authwall|login|checkpoint|signup)/.test(location.pathname) ||
			!!document.querySelector('[data-test-id*="authwall"], .authwall-join-form, form.join-form, #join-form') ||
			/Sign in to view|Join now to see/i.test(wallText),
		missing: /This page doesn.t exist|Profile not found|This profile is not available/i.test(wallText)
	};
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

/** Trims lines, drops empty and noise lines, and removes LinkedIn's doubled lines (visible + screen-reader copy). */
export function cleanText(raw: string, maxChars = 12_000): string {
	const out: string[] = [];
	for (const line of raw.split('\n')) {
		const t = line.replace(/\s+/g, ' ').trim();
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
	if (!profile.heading) throw new ProfileError('empty');

	const sections: Record<string, string> = {};
	let intro = '';
	for (const s of profile.sections) {
		const heading = cleanHeading(s.heading);
		const text = withoutHeading(cleanText(s.text, 6_000), heading);
		// The top card is the section that holds the name; it has no heading of its own worth keeping.
		if (!intro && s.text.includes(profile.heading)) intro = cleanText(s.text, 2_000);
		else if (text && heading) sections[heading] = text;
	}
	for (const d of details) {
		if (d.capture.signedOut || d.capture.missing) continue;
		const text = withoutHeading(cleanText(d.capture.text), d.heading);
		// The full list replaces the shortened one from the profile page, when it has more.
		if (text && text.length > (sections[d.heading]?.length ?? 0)) sections[d.heading] = text;
	}
	const allText = `${intro}\n${profile.text}`;
	return {
		slug,
		url: profileUrl(slug),
		name: profile.heading,
		photo: profile.photo,
		intro,
		connections: COUNT('connections').exec(allText)?.[1] ?? null,
		followers: COUNT('followers').exec(allText)?.[1] ?? null,
		sections,
		posts: posts && !posts.signedOut ? cleanText(posts.text, 10_000) : '',
		capturedAt: now,
		gaps
	};
}

/** A tag the profile text cannot close by itself: random per call, so "</linkedin_profile>" in a bio is just text. */
export const profileTag = () => `linkedin_profile_${Math.random().toString(36).slice(2, 10)}`;

/** The snapshot as one block of text for the AI, clearly marked as data rather than instructions. */
export function snapshotText(p: ProfileSnapshot, tag = profileTag()): string {
	const parts = [
		`Name: ${p.name}`,
		`Profile: ${p.url}`,
		p.connections && `Connections: ${p.connections}`,
		p.followers && `Followers: ${p.followers}`,
		p.intro && `## Intro\n${p.intro}`,
		...Object.entries(p.sections ?? {}).map(([h, t]) => `## ${h}\n${t}`),
		p.posts && `## Recent activity and posts\n${p.posts}`
	].filter(Boolean);
	const body = parts.join('\n\n').replaceAll(tag, '');
	return `<${tag}>\n${body}\n</${tag}>`;
}
