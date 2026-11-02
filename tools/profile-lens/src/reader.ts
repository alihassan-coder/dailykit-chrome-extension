// Reads a whole profile: the page you are on, then each full-list page it cuts short (experience,
// certifications, ...) and the activity page, in the same tab, one at a time, and finally back to the profile.
// One profile per click, at a person's pace (a random 1–3 s pause between pages): no background crawling,
// nothing LinkedIn would see as a bot run. A page that fails is recorded as a gap instead of losing the run.
import {
	DETAIL_PAGES,
	ProfileError,
	buildSnapshot,
	capturePage,
	detailUrl,
	postsUrl,
	profileSlug,
	profileUrl,
	type PageCapture,
	type PageKind,
	type ProfileSnapshot
} from './profile.ts';

/** The few browser calls the reader needs, so tests can stand in for a real tab. */
export interface TabDriver {
	url(tabId: number): Promise<string | undefined>;
	/** Opens the URL in the tab and resolves once it has loaded. */
	open(tabId: number, url: string): Promise<void>;
	/** Reads the page; `slug` lets it wait until LinkedIn's single-page app shows that profile. */
	capture(tabId: number, kind: PageKind, slug: string): Promise<PageCapture>;
}

export type ReadStep = { label: string; done: number; total: number };

const stopped = () => new DOMException('Stopped', 'AbortError');

/** Waits, but gives up at once when stopped. */
export function pauseFor(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(stopped());
		const t = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(t);
			reject(stopped());
		}
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/** The promise, unless Stop is pressed first. */
function orStop<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return work;
	if (signal.aborted) return Promise.reject(stopped());
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(stopped());
		signal.addEventListener('abort', onAbort, { once: true });
		work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

/** A person-paced gap between page loads: 1–3 s. */
const humanPause = (signal?: AbortSignal) => pauseFor(1_000 + Math.random() * 2_000, signal);

const onPage = (capture: PageCapture, slug: string, part?: string) =>
	profileSlug(capture.url) === slug && (!part || capture.url.includes(part));

export async function readProfile(
	tabId: number,
	tab: TabDriver,
	options: {
		posts: boolean;
		onStep?: (step: ReadStep) => void;
		signal?: AbortSignal;
		/** The wait between page loads; tests pass a no-op. */
		pause?: (signal?: AbortSignal) => Promise<void>;
	}
): Promise<ProfileSnapshot> {
	const { signal } = options;
	const pause = options.pause ?? humanPause;
	const slug = profileSlug(await tab.url(tabId));
	if (!slug) throw new ProfileError('not-profile');

	let total = 1 + (options.posts ? 1 : 0);
	let done = 0;
	const step = (label: string) => options.onStep?.({ label, done: done++, total });
	const stopIfAsked = () => {
		if (signal?.aborted) throw stopped();
	};

	step('Reading the profile');
	const profile = await orStop(tab.capture(tabId, 'profile', slug), signal);
	// Fail early on a sign-in wall or a missing profile, before opening any more pages.
	buildSnapshot(slug, profile, [], null);
	// The single-page app may still have been showing someone else.
	if (!onPage(profile, slug)) throw new ProfileError('stale');
	// Only lists the profile cut short need their own page; short ones are already complete.
	const pages = DETAIL_PAGES.filter((p) => profile.detailLinks.includes(p.id));
	total += pages.length;

	const details: { heading: string; capture: PageCapture }[] = [];
	const gaps: string[] = [];
	let posts: PageCapture | null = null;
	let moved = false;

	/** One page; a failure becomes a gap, a stop ends the run. */
	async function read(label: string, url: string, kind: PageKind, gap: string) {
		stopIfAsked();
		if (moved) await pause(signal);
		step(label);
		moved = true;
		try {
			await orStop(tab.open(tabId, url), signal);
			const capture = await orStop(tab.capture(tabId, kind, slug!), signal);
			if (capture.signedOut) {
				gaps.push(gap);
				return null;
			}
			return capture;
		} catch (e) {
			if (signal?.aborted) throw stopped();
			if (e instanceof ProfileError && e.problem === 'signed-out') throw e;
			gaps.push(gap);
			return null;
		}
	}

	try {
		for (const page of pages) {
			const capture = await read(
				`Reading ${page.heading.toLowerCase()}`,
				detailUrl(slug, page.id),
				'details',
				page.heading
			);
			// LinkedIn sends you back to the profile when a person has no such list; that is not an error.
			if (capture && onPage(capture, slug, `/details/${page.id}`)) details.push({ heading: page.heading, capture });
		}
		if (options.posts) {
			const capture = await read('Reading recent posts', postsUrl(slug), 'posts', 'Recent posts');
			if (capture && onPage(capture, slug, '/recent-activity')) posts = capture;
			else if (capture) gaps.push('Recent posts');
		}
	} finally {
		if (moved) await tab.open(tabId, profileUrl(slug)).catch(() => {});
	}
	return buildSnapshot(slug, profile, details, posts, Date.now(), gaps);
}

type TabsApi = {
	get(tabId: number): Promise<{ url?: string; status?: string }>;
	update(tabId: number, props: { url: string }): Promise<unknown>;
	onUpdated: {
		addListener(fn: (tabId: number, info: { status?: string }) => void): void;
		removeListener(fn: (tabId: number, info: { status?: string }) => void): void;
	};
};
type ScriptingApi = {
	executeScript(options: {
		target: { tabId: number };
		func: (kind: PageKind, slug?: string) => Promise<PageCapture>;
		args: [PageKind, string];
	}): Promise<{ result?: unknown }[]>;
};

const LOAD_TIMEOUT_MS = 20_000;
/** LinkedIn draws the page with JavaScript after "complete"; give it a moment before reading. */
const SETTLE_MS = 1_500;

/** The real driver, on top of chrome.tabs and chrome.scripting. */
export function browserTabs(tabs: TabsApi, scripting: ScriptingApi): TabDriver {
	return {
		url: async (tabId) => (await tabs.get(tabId)).url,
		open: (tabId, url) =>
			new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					tabs.onUpdated.removeListener(onUpdated);
					reject(new Error('LinkedIn took too long to load.'));
				}, LOAD_TIMEOUT_MS);
				function onUpdated(id: number, info: { status?: string }) {
					if (id !== tabId || info.status !== 'complete') return;
					tabs.onUpdated.removeListener(onUpdated);
					clearTimeout(timer);
					setTimeout(resolve, SETTLE_MS);
				}
				tabs.onUpdated.addListener(onUpdated);
				tabs.update(tabId, { url }).catch((e: unknown) => {
					tabs.onUpdated.removeListener(onUpdated);
					clearTimeout(timer);
					reject(e instanceof Error ? e : new Error(String(e)));
				});
			}),
		async capture(tabId, kind, slug) {
			const [frame] = await scripting.executeScript({ target: { tabId }, func: capturePage, args: [kind, slug] });
			if (!frame?.result) throw new ProfileError('empty');
			return frame.result as PageCapture;
		}
	};
}
