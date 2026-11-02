import { describe, expect, it } from 'vitest';
import { profileSlug, type PageCapture, type PageKind, type PageProbe } from '../src/profile.ts';
import { readProfile, type ReadOptions, type ReadStep, type TabDriver } from '../src/reader.ts';

const page = (url: string, over: Partial<PageCapture> = {}): PageCapture => ({
	url,
	heading: 'Jane Doe',
	photo: null,
	sections: [{ heading: '', text: 'Jane Doe\nFounder at Acme' }],
	text: `text of ${url}`,
	detailLinks: ['experience', 'skills', 'unknown-list'],
	signedOut: false,
	missing: false,
	...over
});

const JANE = 'https://www.linkedin.com/in/jane/';

/** A pretend tab: remembers where it was sent and returns a capture for each page. */
function fakeTab(start: string, redirect: string[] = []) {
	let current = start;
	let status = 'complete';
	const opened: string[] = [];
	const log: string[] = [];
	const state = { reloads: 0, access: true, readyAfterReload: true, readyNow: true };
	const tab: TabDriver = {
		info: async () => ({ url: current, status }),
		hasAccess: async () => state.access,
		open: async (_id, url) => {
			opened.push(url);
			log.push(`open ${url}`);
			// LinkedIn sends you back to the profile when a list doesn't exist.
			current = redirect.some((r) => url.includes(r)) ? JANE : url;
		},
		reload: async () => {
			state.reloads++;
			log.push('reload');
			if (state.readyAfterReload) state.readyNow = true;
		},
		waitLoaded: async () => {
			log.push('wait');
			status = 'complete';
			return true;
		},
		probe: async (_id, _kind: PageKind, slug): Promise<PageProbe> => ({
			url: current,
			ready: state.readyNow && profileSlug(current) === slug,
			signedOut: false,
			missing: false
		}),
		capture: async (_id, _kind: PageKind) => page(current)
	};
	return {
		tab,
		opened,
		log,
		state,
		at: () => current,
		loading: () => {
			status = 'loading';
		}
	};
}

const pauses: number[] = [];
const noPause = async () => void pauses.push(1);
const fast: Partial<ReadOptions> = { pause: noPause, readyTimeoutMs: 30, pollMs: 5 };

const problemOf = (p: Promise<unknown>) =>
	p.then(
		() => null,
		(e: { problem?: string; app?: { code: string } }) => e.problem ?? e.app?.code ?? String(e)
	);

describe('readProfile', () => {
	it('reads only the lists the profile cut short, then posts, then returns to the profile', async () => {
		const { tab, opened } = fakeTab(JANE);
		const steps: ReadStep[] = [];
		pauses.length = 0;
		const p = await readProfile(1, tab, { posts: true, onStep: (s) => steps.push(s), pause: noPause });
		expect(opened).toEqual([
			'https://www.linkedin.com/in/jane/details/experience/',
			'https://www.linkedin.com/in/jane/details/skills/',
			'https://www.linkedin.com/in/jane/recent-activity/all/',
			JANE
		]);
		expect(steps.map((s) => s.label)).toEqual([
			'Reading the profile',
			'Reading Experience',
			'Reading Skills',
			'Reading recent posts'
		]);
		// A person-paced pause between each page load (not before the first).
		expect(pauses).toHaveLength(2);
		// The count grows once the profile shows which full lists exist: "Reading Experience (2/4)".
		expect(steps.slice(1).every((s) => s.total === 4)).toBe(true);
		expect(steps[1]).toMatchObject({ done: 1, total: 4 });
		expect(p.sections.Experience).toContain('details/experience');
		expect(p.posts).toContain('recent-activity');
		expect(p.gaps).toEqual([]);
	});

	it('skips a list LinkedIn redirects away from, and posts when asked to', async () => {
		const { tab, opened } = fakeTab(JANE, ['/details/skills']);
		const p = await readProfile(1, tab, { posts: false, pause: noPause });
		expect(opened.some((u) => u.includes('recent-activity'))).toBe(false);
		expect(p.sections.Skills).toBeUndefined();
		expect(p.posts).toBe('');
		expect(p.gaps).toEqual([]);
	});

	it('skips a full-list page when the embedded page data already has every entry', async () => {
		const { tab, opened } = fakeTab(JANE);
		const blob = JSON.stringify({
			included: [
				{ $type: 'x.Profile', entityUrn: 'urn:li:fsd_profile:J1', publicIdentifier: 'jane', firstName: 'Jane' },
				...[1, 2].map((n) => ({
					$type: 'x.Position',
					entityUrn: `urn:li:fsd_position:(J1,${n})`,
					title: `Role ${n}`,
					companyName: 'Acme'
				}))
			]
		});
		tab.capture = async () =>
			page(JANE, {
				detailLinks: ['experience', 'skills'],
				detailCounts: { experience: 2, skills: 9 },
				embedded: [blob]
			});
		await readProfile(1, tab, { posts: false, pause: noPause });
		expect(opened).toEqual(['https://www.linkedin.com/in/jane/details/skills/', JANE]);
	});

	it('keeps what it read when one page fails, and records the gap', async () => {
		const { tab, opened, at } = fakeTab(JANE);
		tab.capture = async () => {
			if (at().includes('/details/skills')) throw new Error('Frame with ID 0 was removed.');
			return page(at());
		};
		const p = await readProfile(1, tab, { posts: true, ...fast });
		expect(p.gaps).toEqual(['Skills']);
		expect(p.sections.Experience).toContain('details/experience');
		expect(p.posts).toContain('recent-activity');
		expect(opened.at(-1)).toBe(JANE);
	});

	it('records posts as a gap when the activity page shows something else', async () => {
		const { tab } = fakeTab(JANE);
		const capture = tab.capture;
		tab.capture = async (id, kind, slug) =>
			kind === 'posts'
				? page('https://www.linkedin.com/in/someone-else/recent-activity/all/')
				: capture(id, kind, slug);
		const p = await readProfile(1, tab, { posts: true, pause: noPause });
		expect(p.gaps).toEqual(['Recent posts']);
		expect(p.posts).toBe('');
	});

	it('refuses a capture of another profile (the single-page app had not switched yet)', async () => {
		const { tab, opened } = fakeTab(JANE);
		tab.capture = async () => page('https://www.linkedin.com/in/previous-person/', { heading: 'Previous Person' });
		await expect(readProfile(1, tab, { posts: true, pause: noPause })).rejects.toMatchObject({
			problem: 'stale',
			app: { code: 'tab_gone' }
		});
		expect(opened).toEqual([]);
	});

	it('says what to open when the tab is not a profile, before opening anything', async () => {
		const feed = fakeTab('https://www.linkedin.com/feed/');
		expect(await problemOf(readProfile(1, feed.tab, { posts: true }))).toBe('not-profile');
		expect(feed.opened).toEqual([]);
		const other = fakeTab('https://example.com/');
		expect(await problemOf(readProfile(1, other.tab, { posts: true }))).toBe('not-linkedin');
	});

	it('reports the sign-in wall from its URL, and on the page, without opening more pages', async () => {
		const wall = fakeTab('https://www.linkedin.com/authwall?sessionRedirect=x');
		expect(await problemOf(readProfile(1, wall.tab, { posts: true }))).toBe('signed-out');

		const { tab, opened } = fakeTab(JANE);
		tab.capture = async () => page(JANE, { signedOut: true });
		await expect(readProfile(1, tab, { posts: true })).rejects.toMatchObject({
			problem: 'signed-out',
			app: { code: 'linkedin_signed_out', action: { kind: 'sign-in-linkedin' } }
		});
		expect(opened).toEqual([]);
	});

	it('asks for access to LinkedIn first when it is missing', async () => {
		const { tab, opened } = fakeTab(JANE);
		tab.hasAccess = async () => false;
		await expect(readProfile(1, tab, { posts: true })).rejects.toMatchObject({
			problem: 'no-access',
			app: { code: 'no_host_access', action: { kind: 'grant-access' } }
		});
		expect(opened).toEqual([]);
	});

	it('opens the profile page itself when the tab is on one of its sub-pages, or on someone picked', async () => {
		const sub = fakeTab('https://www.linkedin.com/in/jane/details/experience/');
		const steps: ReadStep[] = [];
		await readProfile(1, sub.tab, { posts: false, onStep: (s) => steps.push(s), ...fast });
		expect(sub.opened[0]).toBe(JANE);
		expect(steps[0]).toMatchObject({ label: 'Opening the profile page', waiting: true });

		const search = fakeTab('https://www.linkedin.com/search/results/people/?keywords=jane');
		const p = await readProfile(1, search.tab, { posts: false, slug: 'jane', ...fast });
		expect(search.opened[0]).toBe(JANE);
		expect(p.slug).toBe('jane');
	});

	it('waits for a tab that is still loading, and says so', async () => {
		const t = fakeTab(JANE);
		t.loading();
		const steps: ReadStep[] = [];
		await readProfile(1, t.tab, { posts: false, onStep: (s) => steps.push(s), ...fast });
		expect(t.log[0]).toBe('wait');
		expect(steps[0]).toMatchObject({ label: 'Waiting for LinkedIn to load', waiting: true });
		expect(t.state.reloads).toBe(0);
	});

	it('reloads once when the page is stuck half drawn, then reads it', async () => {
		const t = fakeTab(JANE);
		t.state.readyNow = false;
		const steps: ReadStep[] = [];
		const p = await readProfile(1, t.tab, { posts: false, onStep: (s) => steps.push(s), ...fast });
		expect(t.state.reloads).toBe(1);
		expect(steps.map((s) => s.label)).toContain('Reloading LinkedIn');
		expect(p.name).toBe('Jane Doe');
	});

	it('gives a clear error with Retry when the page is still not drawn after the reload', async () => {
		const t = fakeTab(JANE);
		t.state.readyNow = false;
		t.state.readyAfterReload = false;
		const err = await readProfile(1, t.tab, { posts: false, ...fast }).catch((e: unknown) => e);
		expect(err).toMatchObject({
			problem: 'empty',
			app: { title: 'LinkedIn didn’t finish loading', action: { kind: 'retry' } }
		});
		expect(t.state.reloads).toBe(1);
	});

	it('tries a read once more when it raced a navigation', async () => {
		const t = fakeTab(JANE);
		let calls = 0;
		const capture = t.tab.capture;
		t.tab.capture = async (...args) => {
			if (calls++ === 0) throw new Error('Frame with ID 0 was removed.');
			return capture(...args);
		};
		const p = await readProfile(1, t.tab, { posts: false, ...fast });
		expect(p.name).toBe('Jane Doe');
	});

	it('explains an error page instead of passing on the browser’s words', async () => {
		const t = fakeTab(JANE);
		t.tab.probe = async () => {
			throw new Error('Cannot access contents of url "chrome-error://chromewebdata/".');
		};
		t.tab.info = async () => ({ url: 'chrome-error://chromewebdata/', status: 'complete' });
		const err = await readProfile(1, t.tab, { posts: false, slug: 'jane', ...fast }).catch((e: unknown) => e);
		expect(err).toMatchObject({ problem: 'load-failed', app: { title: 'LinkedIn didn’t load' } });
	});

	it('goes back to the profile even when stopped halfway', async () => {
		const { tab, opened } = fakeTab(JANE);
		const stop = new AbortController();
		const p = readProfile(1, tab, {
			posts: true,
			signal: stop.signal,
			pause: noPause,
			onStep: (s) => s.done === 1 && stop.abort()
		});
		await expect(p).rejects.toThrow('Stopped');
		expect(opened.at(-1)).toBe(JANE);
	});

	it('goes back to the profile when a later step fails, and reports when it can’t', async () => {
		const { tab, opened, at } = fakeTab(JANE);
		tab.capture = async () => {
			if (at().includes('recent-activity')) throw Object.assign(new Error('x'), { name: 'Boom' });
			return page(at());
		};
		const failures: unknown[] = [];
		const open = tab.open;
		tab.open = async (id, url) => {
			if (url === JANE) {
				failures.push('tried');
				throw new Error('No tab with id: 1.');
			}
			return open(id, url);
		};
		const returned: unknown[] = [];
		const p = await readProfile(1, tab, { posts: true, ...fast, onReturnFailed: (e) => returned.push(e) });
		expect(p.gaps).toEqual(['Recent posts']);
		expect(failures).toEqual(['tried']);
		expect(returned).toHaveLength(1);
		expect(opened.at(-1)).toContain('recent-activity');
	});

	it('stops during the pause between pages, without waiting it out', async () => {
		const { tab, opened } = fakeTab(JANE);
		const stop = new AbortController();
		const started = Date.now();
		const p = readProfile(1, tab, {
			posts: true,
			signal: stop.signal,
			onStep: (s) => s.done === 1 && setTimeout(() => stop.abort(), 10)
		});
		await expect(p).rejects.toThrow('Stopped');
		expect(Date.now() - started).toBeLessThan(900);
		expect(opened).toEqual(['https://www.linkedin.com/in/jane/details/experience/', JANE]);
	});
});
