// What Profile lens reads from LinkedIn, and how. LinkedIn changes its markup often, so we capture each
// section's visible text (keyed by its heading) instead of relying on class names, clean it here, and let
// the AI turn it into facts. Only `capturePage` runs inside the LinkedIn tab; everything else is plain logic.

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
}

export type ProfileProblem = 'not-profile' | 'signed-out' | 'missing' | 'empty';

export class ProfileError extends Error {
	constructor(readonly problem: ProfileProblem) {
		super(PROBLEMS[problem]);
	}
}

export const PROBLEMS: Record<ProfileProblem, string> = {
	'not-profile': 'Open someone’s LinkedIn profile (linkedin.com/in/…) in this tab, then try again.',
	'signed-out': 'LinkedIn is asking you to sign in. Sign in to LinkedIn in this browser, then try again.',
	missing: 'This profile isn’t available. It may be private, removed, or the link may be wrong.',
	empty: 'The profile didn’t finish loading. Scroll the page once, then try again.'
};

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
 * outside helpers. Scrolls to load lazy parts, opens "see more" texts, then returns what is on screen.
 * Clicking "see more" only expands text in place; it never follows a link or changes anything.
 */
export async function capturePage(kind: PageKind): Promise<PageCapture> {
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const textOf = (el: Element | null) => (el ? ((el as HTMLElement).innerText ?? el.textContent ?? '') : '');

	const rounds = kind === 'posts' ? 4 : 2;
	for (let i = 0; i < rounds; i++) {
		window.scrollTo(0, document.body.scrollHeight);
		await wait(700);
	}
	for (const button of document.querySelectorAll('button')) {
		if (/^…?\s*see more$|^show more$/i.test((button.textContent ?? '').trim())) button.click();
	}
	await wait(300);
	window.scrollTo(0, 0);

	const main = document.querySelector('main') ?? document.body;
	const sections = [...main.querySelectorAll('section')]
		.map((section) => ({ heading: textOf(section.querySelector('h2')).trim(), text: textOf(section) }))
		.filter((s) => s.heading && s.text.trim());
	const photo =
		[...main.querySelectorAll('img')].find((img) => /profile-displayphoto|profile-framedphoto/.test(img.src))?.src ??
		null;
	const pageText = textOf(document.body);
	const detailLinks = [
		...new Set(
			[...main.querySelectorAll('a[href*="/details/"]')]
				.map((a) => /\/details\/([a-z-]+)/.exec((a as HTMLAnchorElement).href)?.[1])
				.filter((id): id is string => !!id)
		)
	];

	return {
		url: location.href,
		heading: textOf(main.querySelector('h1')).trim(),
		photo,
		sections,
		text: textOf(main),
		detailLinks,
		signedOut:
			/\/(authwall|login|checkpoint)/.test(location.pathname) || /Sign in to view|Join now to see/i.test(pageText),
		missing: /This page doesn.t exist|Profile not found|This profile is not available/i.test(pageText)
	};
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
	while (lines[0] === heading) lines.shift();
	return lines.join('\n');
}

const COUNT = (label: string) => new RegExp(`([\\d.,]+\\+?[KkMm]?)\\s+${label}`);

/** Puts the captured pages together into one snapshot of the person. */
export function buildSnapshot(
	slug: string,
	profile: PageCapture,
	details: { heading: string; capture: PageCapture }[],
	posts: PageCapture | null,
	now = Date.now()
): ProfileSnapshot {
	if (profile.signedOut) throw new ProfileError('signed-out');
	if (profile.missing) throw new ProfileError('missing');
	if (!profile.heading) throw new ProfileError('empty');

	const sections: Record<string, string> = {};
	let intro = '';
	for (const s of profile.sections) {
		const text = withoutHeading(cleanText(s.text, 6_000), s.heading);
		// The top card is the section that holds the name; it has no heading of its own worth keeping.
		if (!intro && s.text.includes(profile.heading)) intro = cleanText(s.text, 2_000);
		else if (text) sections[s.heading] = text;
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
		capturedAt: now
	};
}

/** The snapshot as one block of text for the AI, clearly marked as data rather than instructions. */
export function snapshotText(p: ProfileSnapshot): string {
	const parts = [
		`Name: ${p.name}`,
		`Profile: ${p.url}`,
		p.connections && `Connections: ${p.connections}`,
		p.followers && `Followers: ${p.followers}`,
		`## Intro\n${p.intro}`,
		...Object.entries(p.sections).map(([h, t]) => `## ${h}\n${t}`),
		p.posts && `## Recent activity and posts\n${p.posts}`
	].filter(Boolean);
	return `<linkedin_profile>\n${parts.join('\n\n')}\n</linkedin_profile>`;
}
