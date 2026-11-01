// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildSnapshot,
	capturePage,
	cleanText,
	profileSlug,
	snapshotText,
	type PageCapture,
	type ProfileError
} from '../src/profile.ts';

const capture = (over: Partial<PageCapture> = {}): PageCapture => ({
	url: 'https://www.linkedin.com/in/jane-doe/',
	heading: 'Jane Doe',
	photo: 'https://media.licdn.com/profile-displayphoto-1.jpg',
	sections: [
		{ heading: '', text: 'Jane Doe\nHead of Growth at Acme\nBerlin, Germany\n500+ connections\n1,204 followers' },
		{ heading: 'About', text: 'About\nAbout\nI help B2B teams grow.\n…see more' },
		{ heading: 'Experience', text: 'Experience\nHead of Growth\nAcme · Full-time' }
	],
	text: '',
	detailLinks: [],
	signedOut: false,
	missing: false,
	...over
});

describe('profileSlug', () => {
	it('takes the handle from profile links only', () => {
		expect(profileSlug('https://www.linkedin.com/in/jane-doe-12/')).toBe('jane-doe-12');
		expect(profileSlug('https://www.linkedin.com/in/jane-doe/details/experience/')).toBe('jane-doe');
		expect(profileSlug('https://www.linkedin.com/in/j%C3%BCrgen/')).toBe('jürgen');
		for (const url of [
			'https://www.linkedin.com/feed/',
			'https://www.linkedin.com/company/acme/',
			'https://evil.com/in/jane/',
			'https://linkedin.com.evil.com/in/jane/',
			'http://www.linkedin.com/in/jane/',
			'not a url',
			undefined
		])
			expect(profileSlug(url)).toBeNull();
	});
});

describe('cleanText', () => {
	it('drops buttons, blank lines and LinkedIn’s doubled screen-reader lines', () => {
		expect(cleanText('Experience\nExperience\n\n  Head   of Growth \nShow all 12 experiences\n…see more\nFollow')).toBe(
			'Experience\nHead of Growth'
		);
	});

	it('cuts very long text and says so', () => {
		const out = cleanText('a line\n'.repeat(10) + 'x'.repeat(100), 50);
		expect(out.length).toBeLessThan(80);
		expect(out).toContain('[…cut for length]');
	});
});

describe('buildSnapshot', () => {
	it('puts the top card, sections, counts and full lists together', () => {
		const details = [
			{
				heading: 'Experience',
				capture: capture({ text: 'Experience\nHead of Growth\nAcme\nMarketing lead\nBeta GmbH\nAnalyst\nGamma' })
			}
		];
		const posts = capture({ text: 'Posted 2d ago\nWe are hiring!\nLike\nComment' });
		const p = buildSnapshot('jane-doe', capture(), details, posts, 42);
		expect(p).toMatchObject({
			slug: 'jane-doe',
			name: 'Jane Doe',
			connections: '500+',
			followers: '1,204',
			capturedAt: 42
		});
		expect(p.intro).toContain('Head of Growth at Acme');
		expect(p.sections.About).toBe('I help B2B teams grow.');
		expect(p.sections.Experience).toContain('Beta GmbH');
		expect(p.posts).toBe('Posted 2d ago\nWe are hiring!');
	});

	it('explains why a page can’t be read', () => {
		const problem = (c: PageCapture) => {
			try {
				buildSnapshot('jane-doe', c, [], null);
			} catch (e) {
				return (e as ProfileError).problem;
			}
		};
		expect(problem(capture({ signedOut: true }))).toBe('signed-out');
		expect(problem(capture({ missing: true }))).toBe('missing');
		expect(problem(capture({ heading: '' }))).toBe('empty');
	});

	it('hands the profile to the AI marked as data', () => {
		const text = snapshotText(buildSnapshot('jane-doe', capture(), [], null));
		expect(text.startsWith('<linkedin_profile>')).toBe(true);
		expect(text).toContain('## About\nI help B2B teams grow.');
	});
});

describe('capturePage (runs in the LinkedIn tab)', () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('reads the heading, photo, sections and full-list links, and opens “see more”', async () => {
		vi.useFakeTimers();
		window.scrollTo = () => {};
		document.body.innerHTML = `<main>
			<section><h1>Jane Doe</h1><img src="https://media.licdn.com/dms/image/profile-displayphoto-shrink_400.jpg"></section>
			<section><h2>About</h2><p>I help teams grow.</p><button>…see more</button></section>
			<section><h2>Experience</h2><a href="https://www.linkedin.com/in/jane-doe/details/experience/">Show all 9 experiences</a></section>
		</main>`;
		const seeMore = vi.fn();
		document.querySelector('button')!.addEventListener('click', seeMore);
		const pending = capturePage('profile');
		await vi.runAllTimersAsync();
		const page = await pending;
		expect(page.heading).toBe('Jane Doe');
		expect(page.photo).toContain('profile-displayphoto');
		expect(page.sections.map((s) => s.heading)).toEqual(['About', 'Experience']);
		expect(page.detailLinks).toEqual(['experience']);
		expect(seeMore).toHaveBeenCalled();
		expect(page.signedOut).toBe(false);
	});
});
