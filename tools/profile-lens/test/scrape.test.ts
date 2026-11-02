// @vitest-environment jsdom
// The in-page readers (probePage, capturePage, findProfileLinks) and the parser, against saved LinkedIn pages.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ProfileError,
	buildSnapshot,
	capturePage,
	findProfileLinks,
	probePage,
	snapshotBody,
	type PageKind
} from '../src/profile.ts';
import { computeFacts } from '../src/structured.ts';
import authwall from './fixtures/authwall.html?raw';
import detailsExperience from './fixtures/details-experience.html?raw';
import guestProfile from './fixtures/guest-profile.html?raw';
import halfRendered from './fixtures/half-rendered.html?raw';
import profileDom from './fixtures/profile-dom.html?raw';
import profileEmbedded from './fixtures/profile-embedded.html?raw';
import searchResults from './fixtures/search-results.html?raw';

const FIXTURES: Record<string, string> = {
	'profile-embedded.html': profileEmbedded,
	'profile-dom.html': profileDom,
	'details-experience.html': detailsExperience,
	'authwall.html': authwall,
	'guest-profile.html': guestProfile,
	'half-rendered.html': halfRendered,
	'search-results.html': searchResults
};
const fixture = (name: string) => FIXTURES[name]!;

/** Shows a fixture as if the tab were at `path` on linkedin.com. */
function load(name: string, path: string) {
	window.history.replaceState(null, '', path);
	document.documentElement.innerHTML = fixture(name).replace(/^<!doctype html>/i, '');
}

async function capture(kind: PageKind, slug: string) {
	vi.useFakeTimers();
	window.scrollTo = () => {};
	const pending = capturePage(kind, slug);
	await vi.runAllTimersAsync();
	return pending;
}

const NOW = new Date('2026-11-15T12:00:00Z');

afterEach(() => {
	vi.useRealTimers();
	document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('a profile with LinkedIn’s embedded page data', () => {
	it('is ready to read, and takes name, headline, location, roles, schools and skills from the data', async () => {
		load('profile-embedded.html', '/in/jane-doe/');
		expect(probePage('profile', 'jane-doe')).toMatchObject({ ready: true, signedOut: false, missing: false });
		const page = await capture('profile', 'jane-doe');
		expect(page.embedded).toHaveLength(2);
		expect(page.detailCounts).toEqual({ experience: 3, skills: 3 });
		const snap = buildSnapshot('jane-doe', page, [], null, 1);
		const s = snap.structured!;
		expect(s.sources).toEqual({
			profile: 'embedded',
			experience: 'embedded',
			education: 'embedded',
			skills: 'embedded',
			certifications: 'embedded'
		});
		expect(s).toMatchObject({
			name: 'Jane Doe',
			headline: 'Head of Growth at Acme | B2B SaaS',
			location: 'Berlin, Germany',
			skills: ['Growth Marketing', 'SaaS', 'Sales'],
			certifications: ['Inbound Marketing — HubSpot'],
			education: [{ school: 'TU Berlin', degree: 'MSc, Economics', start: { year: 2012 }, end: { year: 2015 } }]
		});
		expect(s.about).toContain('Previously scaled Beta');
		// Most recent first, and the viewer's own job is not mixed in.
		expect(s.experience.map((p) => `${p.title} @ ${p.company}`)).toEqual([
			'Head of Growth @ Acme',
			'Marketing Lead @ Beta GmbH',
			'Analyst @ Gamma'
		]);
		expect(s.experience[0]).toMatchObject({ current: true, start: { year: 2021, month: 1 } });
	});

	it('computes years of experience from the dates, counting overlapping roles once', async () => {
		load('profile-embedded.html', '/in/jane-doe/');
		const snap = buildSnapshot('jane-doe', await capture('profile', 'jane-doe'), [], null);
		const facts = computeFacts(snap.structured, NOW);
		// Jun 2015 – Dec 2020 (Gamma and Beta overlap in 2017) is 67 months; Jan 2021 – Nov 2026 is 71.
		expect(facts).toEqual({
			experienceMonths: 138,
			currentTitle: 'Head of Growth',
			currentCompany: 'Acme',
			location: 'Berlin, Germany',
			topSkills: ['Growth Marketing', 'SaaS', 'Sales']
		});
	});

	it('gives the AI the parsed facts and leaves out raw lists the data already covers', async () => {
		load('profile-embedded.html', '/in/jane-doe/');
		const body = snapshotBody(buildSnapshot('jane-doe', await capture('profile', 'jane-doe'), [], null), NOW);
		expect(body).toContain("## Parsed from LinkedIn's page data");
		expect(body).toContain('- Head of Growth — Acme · Jan 2021 – Present · Berlin, Germany');
		expect(body).toContain('Total experience (computed from the dates, overlaps counted once): 11 yrs (11.5 years)');
		expect(body).not.toContain('## Experience');
		expect(body).toContain('## About');
		expect(body).toContain('## Activity');
	});
});

describe('a profile without embedded data', () => {
	it('parses roles from the visible lines: single roles, a company with several roles, and duration noise', async () => {
		load('profile-dom.html', '/in/sam-rivera/');
		expect(probePage('profile', 'sam-rivera').ready).toBe(true);
		const page = await capture('profile', 'sam-rivera');
		expect(page.embedded).toEqual([]);
		expect(page.detailLinks).toEqual(['experience']);
		const snap = buildSnapshot('sam-rivera', page, [], null);
		const s = snap.structured!;
		expect(s.sources).toMatchObject({ experience: 'page', education: 'page', skills: 'page' });
		expect(s.experience).toEqual([
			{
				title: 'Senior Software Engineer',
				company: 'Northwind',
				employmentType: 'Full-time',
				start: { year: 2022, month: 3 },
				end: undefined,
				current: true,
				duration: '4 yrs 9 mos',
				months: 57,
				location: 'Lisbon, Portugal · Hybrid',
				description: 'Leading the React platform team of six engineers.'
			},
			expect.objectContaining({
				title: 'Software Engineer II',
				company: 'Contoso',
				employmentType: 'Full-time',
				start: { year: 2020, month: 1 },
				end: { year: 2022, month: 2 },
				months: 26,
				location: 'Remote'
			}),
			expect.objectContaining({ title: 'Software Engineer', company: 'Contoso', duration: '2 yrs', months: 24 })
		]);
		expect(s.education).toEqual([
			{ school: 'University of Porto', degree: 'BSc, Computer Science', start: { year: 2013 }, end: { year: 2017 } }
		]);
		// Endorsement counts are not skills; the screen-reader copies are not doubled.
		expect(s.skills).toEqual(['TypeScript', 'React', 'Node.js']);
		expect(s.headline).toBe('Senior Software Engineer at Northwind · React, TypeScript');
		expect(s.location).toBe('Lisbon, Portugal');
		expect(snap).toMatchObject({ followers: '1,204', connections: '500+', name: 'Sam Rivera' });
	});

	it('takes the longer list from the full experience page', async () => {
		load('profile-dom.html', '/in/sam-rivera/');
		const page = await capture('profile', 'sam-rivera');
		vi.useRealTimers();
		load('details-experience.html', '/in/sam-rivera/details/experience/');
		const detail = await capture('details', 'sam-rivera');
		const snap = buildSnapshot('sam-rivera', page, [{ heading: 'Experience', capture: detail }], null);
		expect(snap.structured!.experience.map((p) => p.title)).toEqual([
			'Senior Software Engineer',
			'Software Engineer II',
			'Software Engineer',
			'Junior Developer',
			'Teaching Assistant'
		]);
		expect(snap.structured!.experience[3]).toMatchObject({ company: 'Fabrikam', employmentType: 'Internship' });
		// Sep 2015 to Nov 2026 is 135 months, less the gap from Oct to Dec 2017.
		expect(computeFacts(snap.structured, NOW).experienceMonths).toBe(132);
	});
});

describe('pages that are not a readable profile', () => {
	it('spots the sign-in wall', async () => {
		load(
			'authwall.html',
			'/authwall?trk=public_profile&sessionRedirect=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fjane-doe'
		);
		expect(probePage('profile', 'jane-doe')).toMatchObject({ signedOut: true, ready: false });
		const page = await capture('profile', 'jane-doe');
		expect(page.signedOut).toBe(true);
		expect(() => buildSnapshot('jane-doe', page, [], null)).toThrow(ProfileError);
	});

	it('treats the signed-out public view as signed out, and still reads its schema.org data', async () => {
		load('guest-profile.html', '/in/jane-doe/');
		const page = await capture('profile', 'jane-doe');
		expect(page.signedOut).toBe(true);
		expect(probePage('profile', 'jane-doe').signedOut).toBe(true);
		const s = buildSnapshot('jane-doe', { ...page, signedOut: false }, [], null).structured!;
		expect(s.sources.profile).toBe('ld-json');
		expect(s.location).toBe('Berlin, DE');
		expect(s.experience.map((p) => p.company)).toEqual(['Acme', 'Beta GmbH']);
		expect(s.education).toEqual([{ school: 'TU Berlin', start: { year: 2012 }, end: { year: 2015 } }]);
	});

	it('says a half-drawn page is not ready, and refuses to build a snapshot from it', async () => {
		load('half-rendered.html', '/in/jane-doe/');
		expect(probePage('profile', 'jane-doe')).toMatchObject({ ready: false, signedOut: false, missing: false });
		const page = await capture('profile', 'jane-doe');
		expect(page.ready).toBe(false);
		let problem: string | undefined;
		try {
			buildSnapshot('jane-doe', page, [], null);
		} catch (e) {
			problem = (e as ProfileError).problem;
		}
		expect(problem).toBe('empty');
	});

	it('is not ready while the single-page app still shows someone else', () => {
		load('profile-dom.html', '/in/sam-rivera/');
		expect(probePage('profile', 'jane-doe').ready).toBe(false);
	});
});

describe('findProfileLinks', () => {
	it('lists the people on a search page, the selected one first, without the viewer', () => {
		load('search-results.html', '/search/results/people/?keywords=growth');
		expect(findProfileLinks()).toEqual([
			{ slug: 'jane-doe', name: 'Jane Doe' },
			{ slug: 'alex-kim-42', name: 'Alex Kim' },
			{ slug: 'jürgen-m', name: 'Jürgen Müller' }
		]);
	});
});
