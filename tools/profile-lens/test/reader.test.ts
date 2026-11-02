import { describe, expect, it } from 'vitest';
import type { PageCapture, PageKind } from '../src/profile.ts';
import { readProfile, type ReadStep, type TabDriver } from '../src/reader.ts';

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

/** A pretend tab: remembers where it was sent and returns a capture for each page. */
function fakeTab(start: string, redirect: string[] = []) {
	let current = start;
	const opened: string[] = [];
	const tab: TabDriver = {
		url: async () => current,
		open: async (_id, url) => {
			opened.push(url);
			// LinkedIn sends you back to the profile when a list doesn't exist.
			current = redirect.some((r) => url.includes(r)) ? 'https://www.linkedin.com/in/jane/' : url;
		},
		capture: async (_id, _kind: PageKind) => page(current)
	};
	return { tab, opened, at: () => current };
}

const pauses: number[] = [];
const noPause = async () => void pauses.push(1);

describe('readProfile', () => {
	it('reads only the lists the profile cut short, then posts, then returns to the profile', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/');
		const steps: ReadStep[] = [];
		pauses.length = 0;
		const p = await readProfile(1, tab, { posts: true, onStep: (s) => steps.push(s), pause: noPause });
		expect(opened).toEqual([
			'https://www.linkedin.com/in/jane/details/experience/',
			'https://www.linkedin.com/in/jane/details/skills/',
			'https://www.linkedin.com/in/jane/recent-activity/all/',
			'https://www.linkedin.com/in/jane/'
		]);
		expect(steps.map((s) => s.label)).toEqual([
			'Reading the profile',
			'Reading experience',
			'Reading skills',
			'Reading recent posts'
		]);
		// A person-paced pause between each page load (not before the first).
		expect(pauses).toHaveLength(2);
		// The count grows once the profile shows which full lists exist.
		expect(steps.slice(1).every((s) => s.total === 4)).toBe(true);
		expect(p.sections.Experience).toContain('details/experience');
		expect(p.posts).toContain('recent-activity');
		expect(p.gaps).toEqual([]);
	});

	it('skips a list LinkedIn redirects away from, and posts when asked to', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/', ['/details/skills']);
		const p = await readProfile(1, tab, { posts: false, pause: noPause });
		expect(opened.some((u) => u.includes('recent-activity'))).toBe(false);
		expect(p.sections.Skills).toBeUndefined();
		expect(p.posts).toBe('');
		expect(p.gaps).toEqual([]);
	});

	it('keeps what it read when one page fails, and records the gap', async () => {
		const { tab, opened, at } = fakeTab('https://www.linkedin.com/in/jane/');
		tab.capture = async () => {
			if (at().includes('/details/skills')) throw new Error('Frame with ID 0 was removed.');
			return page(at());
		};
		const p = await readProfile(1, tab, { posts: true, pause: noPause });
		expect(p.gaps).toEqual(['Skills']);
		expect(p.sections.Experience).toContain('details/experience');
		expect(p.posts).toContain('recent-activity');
		expect(opened.at(-1)).toBe('https://www.linkedin.com/in/jane/');
	});

	it('records posts as a gap when the activity page shows something else', async () => {
		const { tab } = fakeTab('https://www.linkedin.com/in/jane/');
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
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/');
		tab.capture = async () => page('https://www.linkedin.com/in/previous-person/', { heading: 'Previous Person' });
		await expect(readProfile(1, tab, { posts: true, pause: noPause })).rejects.toMatchObject({
			problem: 'stale',
			app: { code: 'tab_gone' }
		});
		expect(opened).toEqual([]);
	});

	it('refuses pages that are not profiles, before opening anything', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/feed/');
		await expect(readProfile(1, tab, { posts: true })).rejects.toMatchObject({ problem: 'not-profile' });
		expect(opened).toEqual([]);
	});

	it('stops at a sign-in wall without opening more pages', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/');
		tab.capture = async () => page('https://www.linkedin.com/in/jane/', { signedOut: true });
		await expect(readProfile(1, tab, { posts: true })).rejects.toMatchObject({
			problem: 'signed-out',
			app: { code: 'linkedin_signed_out' }
		});
		expect(opened).toEqual([]);
	});

	it('goes back to the profile even when stopped halfway', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/');
		const stop = new AbortController();
		const p = readProfile(1, tab, {
			posts: true,
			signal: stop.signal,
			pause: noPause,
			onStep: (s) => s.done === 1 && stop.abort()
		});
		await expect(p).rejects.toThrow('Stopped');
		expect(opened.at(-1)).toBe('https://www.linkedin.com/in/jane/');
	});

	it('stops during the pause between pages, without waiting it out', async () => {
		const { tab, opened } = fakeTab('https://www.linkedin.com/in/jane/');
		const stop = new AbortController();
		const started = Date.now();
		const p = readProfile(1, tab, {
			posts: true,
			signal: stop.signal,
			onStep: (s) => s.done === 1 && setTimeout(() => stop.abort(), 10)
		});
		await expect(p).rejects.toThrow('Stopped');
		expect(Date.now() - started).toBeLessThan(900);
		expect(opened).toEqual([
			'https://www.linkedin.com/in/jane/details/experience/',
			'https://www.linkedin.com/in/jane/'
		]);
	});
});
