// Reads a whole profile: the page you are on, then each full-list page it cuts short (experience,
// certifications, ...) and the activity page, in the same tab, one at a time, and finally back to the profile.
// One profile per click, at a person's pace (a random 1–3 s pause between pages): no background crawling,
// nothing LinkedIn would see as a bot run. A page that fails is recorded as a gap instead of losing the run.
//
// It heals what it can on its own before giving up: it checks access first, opens the profile page when the
// tab is on one of its sub-pages (or on a profile you picked), waits for a loading tab and for LinkedIn's app
// to draw the profile, reloads once when the page got stuck half-drawn or on someone else, and retries a read
// that raced a navigation. Each failure that is left ends as a ProfileError with plain words and one action.
import {
	DETAIL_PAGES,
	ProfileError,
	buildSnapshot,
	capturePage,
	detailUrl,
	isLinkedIn,
	isMainProfilePage,
	isSignInUrl,
	postsUrl,
	probePage,
	profileSlug,
	profileUrl,
	structuredFrom,
	type PageCapture,
	type PageKind,
	type PageProbe,
	type ProfileSnapshot
} from './profile.ts';
import { LINKEDIN_SITES } from './sites.ts';

export interface TabInfo {
	url?: string;
	status?: string;
	discarded?: boolean;
}

/** The few browser calls the reader needs, so tests can stand in for a real tab. */
export interface TabDriver {
	info(tabId: number): Promise<TabInfo>;
	/** Whether Toolbelt may read linkedin.com (optional host permission in bundle installs). */
	hasAccess(): Promise<boolean>;
	/** Opens the URL in the tab and resolves once it has loaded. */
	open(tabId: number, url: string): Promise<void>;
	/** Reloads the tab and resolves once it has loaded. */
	reload(tabId: number): Promise<void>;
	/** Resolves true once the tab has finished loading, false when `timeoutMs` passes first. */
	waitLoaded(tabId: number, timeoutMs: number): Promise<boolean>;
	/** A quick look: is the page ready to read? */
	probe(tabId: number, kind: PageKind, slug: string): Promise<PageProbe>;
	/** Reads the page; `slug` lets it wait until LinkedIn's single-page app shows that profile. */
	capture(tabId: number, kind: PageKind, slug: string): Promise<PageCapture>;
}

export type ReadStep = {
	label: string;
	done: number;
	total: number;
	/** Waiting on LinkedIn rather than reading: shown without a page count. */
	waiting?: boolean;
};

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

/** How long to wait for LinkedIn to draw a page before reloading (and, after the reload, before giving up). */
export const READY_TIMEOUT_MS = 15_000;

export interface ReadOptions {
	posts: boolean;
	/** The profile to read; defaults to the one open in the tab. When the tab is elsewhere, it is opened first. */
	slug?: string;
	onStep?: (step: ReadStep) => void;
	signal?: AbortSignal;
	/** The wait between page loads; tests pass a no-op. */
	pause?: (signal?: AbortSignal) => Promise<void>;
	/** How long to wait for a page to be ready, and how often to look. Tests pass small numbers. */
	readyTimeoutMs?: number;
	pollMs?: number;
	/** Called when the tab could not be sent back to the profile after reading its other pages. */
	onReturnFailed?: (error: unknown) => void;
}

/** Errors from executeScript that only mean the page was mid-navigation: worth one more try. */
const TRANSIENT = /frame with id|no frame|frame was removed|was discarded|navigat|document was unloaded|receiving end/i;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function readProfile(tabId: number, tab: TabDriver, options: ReadOptions): Promise<ProfileSnapshot> {
	const { signal } = options;
	const pause = options.pause ?? humanPause;
	const timeout = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
	const poll = options.pollMs ?? 500;

	if (!(await tab.hasAccess())) throw new ProfileError('no-access');
	const first = await orStop(tab.info(tabId), signal);
	if (isSignInUrl(first.url)) throw new ProfileError('signed-out');
	const slug = options.slug ?? profileSlug(first.url);
	if (!slug) throw new ProfileError(isLinkedIn(first.url) ? 'not-profile' : 'not-linkedin');

	let total = 1 + (options.posts ? 1 : 0);
	let done = 0;
	const step = (label: string) => options.onStep?.({ label, done: done++, total });
	const waiting = (label: string) => options.onStep?.({ label, done: Math.max(0, done - 1), total, waiting: true });
	const stopIfAsked = () => {
		if (signal?.aborted) throw stopped();
	};

	/** Polls until the page is ready (or shows the wall / a missing page), up to the timeout. */
	async function waitReady(kind: PageKind, announce: boolean): Promise<PageProbe | null> {
		const started = Date.now();
		let shown = false;
		const show = () => {
			if (announce && !shown) waiting('Waiting for LinkedIn to load');
			shown = true;
		};
		const info = await orStop(tab.info(tabId), signal);
		if (info.status && info.status !== 'complete') {
			show();
			await orStop(tab.waitLoaded(tabId, timeout), signal);
		}
		let last: PageProbe | null = null;
		for (;;) {
			stopIfAsked();
			try {
				last = await orStop(tab.probe(tabId, kind, slug!), signal);
				if (last.ready || last.signedOut || last.missing) return last;
			} catch (e) {
				if (signal?.aborted) throw stopped();
				const retryable = TRANSIENT.test(messageOf(e)) || (e instanceof ProfileError && e.problem === 'empty');
				if (!retryable) throw await explain(e);
			}
			if (Date.now() - started >= timeout) return last;
			show();
			await pauseFor(poll, signal);
		}
	}

	/** A browser error, in our words when we know better: an error page, or no access after all. */
	async function explain(e: unknown): Promise<unknown> {
		if (e instanceof ProfileError || (e instanceof DOMException && e.name === 'AbortError')) return e;
		const url = (await tab.info(tabId).catch(() => ({}) as TabInfo)).url ?? '';
		if (/^chrome-error:|^about:neterror/.test(url)) return new ProfileError('load-failed');
		if (/cannot access contents of url|host permission/i.test(messageOf(e)) && !(await tab.hasAccess()))
			return new ProfileError('no-access');
		return e;
	}

	/** Reads the page, once more if the first try raced a navigation. */
	async function capture(kind: PageKind): Promise<PageCapture> {
		try {
			return await orStop(tab.capture(tabId, kind, slug!), signal);
		} catch (e) {
			if (signal?.aborted) throw stopped();
			if (!TRANSIENT.test(messageOf(e))) throw await explain(e);
			await pauseFor(poll, signal);
			return orStop(tab.capture(tabId, kind, slug!), signal).catch(async (e2: unknown) => {
				throw await explain(e2);
			});
		}
	}

	// 1. Get the tab onto the profile page itself, loaded and drawn.
	let moved = false;
	const profileHome = profileUrl(slug);
	try {
		const info = await orStop(tab.info(tabId), signal);
		if (info.discarded || /^chrome-error:/.test(info.url ?? '')) {
			waiting('Reloading LinkedIn');
			await orStop(tab.reload(tabId), signal);
		}
		if (!isMainProfilePage(info.url, slug)) {
			waiting(profileSlug(info.url) === slug ? 'Opening the profile page' : 'Opening the profile');
			await orStop(tab.open(tabId, profileHome), signal);
		}

		let probe = await waitReady('profile', true);
		if (probe?.signedOut) throw new ProfileError('signed-out');
		if (probe?.missing) throw new ProfileError('missing');
		if (!probe?.ready) {
			// Stuck, half drawn, or still showing someone else: one reload usually fixes it.
			waiting('Reloading LinkedIn');
			await orStop(tab.reload(tabId), signal);
			probe = await waitReady('profile', true);
			if (probe?.signedOut) throw new ProfileError('signed-out');
			if (probe?.missing) throw new ProfileError('missing');
			if (!probe?.ready) {
				const now = await tab.info(tabId).catch(() => ({}) as TabInfo);
				if (now.status && now.status !== 'complete') throw new ProfileError('slow');
				throw new ProfileError(profileSlug(probe?.url) && profileSlug(probe?.url) !== slug ? 'stale' : 'empty');
			}
		}

		step('Reading the profile');
		const profile = await capture('profile');
		// Fail early on a sign-in wall or a missing profile, before opening any more pages.
		buildSnapshot(slug, profile, [], null);
		// The single-page app may still have been showing someone else.
		if (!onPage(profile, slug)) throw new ProfileError('stale');

		// Only lists the profile cut short need their own page, and not even those when LinkedIn's embedded
		// data on this page already has every entry the "Show all N" link promises.
		const known = structuredFrom(slug, profile);
		const counts = profile.detailCounts ?? {};
		const pages = DETAIL_PAGES.filter((p) => {
			if (!profile.detailLinks.includes(p.id)) return false;
			const list =
				p.id === 'experience' || p.id === 'education' || p.id === 'skills' || p.id === 'certifications'
					? known[p.id]
					: null;
			const embedded = list && known.sources[p.id as 'experience'] === 'embedded';
			return !(embedded && counts[p.id] && list.length >= counts[p.id]!);
		});
		total += pages.length;

		const details: { heading: string; capture: PageCapture }[] = [];
		const gaps: string[] = [];
		let posts: PageCapture | null = null;

		/** One page; a failure becomes a gap, a stop ends the run. */
		async function read(label: string, url: string, kind: PageKind, gap: string) {
			stopIfAsked();
			if (moved) await pause(signal);
			step(label);
			moved = true;
			try {
				await orStop(tab.open(tabId, url), signal);
				const ready = await waitReady(kind, false);
				if (ready?.signedOut) throw new ProfileError('signed-out');
				const capture = await orStop(tab.capture(tabId, kind, slug!), signal);
				if (capture.signedOut) {
					gaps.push(gap);
					return null;
				}
				return capture;
			} catch (e) {
				if (signal?.aborted) throw stopped();
				if (e instanceof ProfileError && (e.problem === 'signed-out' || e.problem === 'no-access')) throw e;
				gaps.push(gap);
				return null;
			}
		}

		for (const page of pages) {
			const capture = await read(`Reading ${page.heading}`, detailUrl(slug, page.id), 'details', page.heading);
			// LinkedIn sends you back to the profile when a person has no such list; that is not an error.
			if (capture && onPage(capture, slug, `/details/${page.id}`)) details.push({ heading: page.heading, capture });
		}
		if (options.posts) {
			const capture = await read('Reading recent posts', postsUrl(slug), 'posts', 'Recent posts');
			if (capture && onPage(capture, slug, '/recent-activity')) posts = capture;
			else if (capture) gaps.push('Recent posts');
		}
		return buildSnapshot(slug, profile, details, posts, Date.now(), gaps);
	} finally {
		// Whatever happened (done, failed, stopped), the tab ends on the profile it started from.
		if (moved)
			await tab.open(tabId, profileHome).catch((e: unknown) => {
				if (options.onReturnFailed) options.onReturnFailed(e);
				else throw e;
			});
	}
}

type TabListener = (tabId: number, info: { status?: string }) => void;
type TabsApi = {
	get(tabId: number): Promise<{ url?: string; pendingUrl?: string; status?: string; discarded?: boolean }>;
	update(tabId: number, props: { url: string }): Promise<unknown>;
	reload(tabId: number): Promise<void>;
	onUpdated: { addListener(fn: TabListener): void; removeListener(fn: TabListener): void };
};
type ScriptingApi = {
	executeScript(options: {
		target: { tabId: number };
		func: (...args: never[]) => unknown;
		args: unknown[];
	}): Promise<{ result?: unknown }[]>;
};
type PermissionsApi = { contains(p: { origins: string[] }): Promise<boolean> };

/** LinkedIn draws the page with JavaScript after "complete"; the probe then waits for it, so this stays short. */
const SETTLE_MS = 600;

/** The real driver, on top of chrome.tabs, chrome.scripting and chrome.permissions. */
export function browserTabs(tabs: TabsApi, scripting: ScriptingApi, permissions?: PermissionsApi): TabDriver {
	/** Starts `go` and resolves once the tab has gone through loading to complete (or is complete at the timeout). */
	const loadVia = (tabId: number, go: () => Promise<unknown>) =>
		new Promise<void>((resolve, reject) => {
			let sawLoading = false;
			const finish = (fn: () => void) => {
				tabs.onUpdated.removeListener(onUpdated);
				clearTimeout(timer);
				fn();
			};
			const timer = setTimeout(() => {
				tabs.get(tabId).then(
					(t) => finish(() => (t.status === 'complete' ? resolve() : reject(new ProfileError('slow')))),
					(e: unknown) => finish(() => reject(e))
				);
			}, READY_TIMEOUT_MS);
			function onUpdated(id: number, info: { status?: string }) {
				if (id !== tabId) return;
				if (info.status === 'loading') sawLoading = true;
				if (info.status === 'complete' && sawLoading) finish(() => setTimeout(resolve, SETTLE_MS));
			}
			tabs.onUpdated.addListener(onUpdated);
			go().catch((e: unknown) => finish(() => reject(e)));
		});

	const run = async <T>(tabId: number, func: (...args: never[]) => unknown, args: unknown[]): Promise<T> => {
		const [frame] = await scripting.executeScript({ target: { tabId }, func, args });
		if (!frame || frame.result === undefined || frame.result === null) throw new ProfileError('empty');
		return frame.result as T;
	};

	return {
		info: async (tabId) => {
			const t = await tabs.get(tabId);
			return { url: t.pendingUrl ?? t.url, status: t.status, discarded: t.discarded };
		},
		hasAccess: () => (permissions ? permissions.contains({ origins: LINKEDIN_SITES }) : Promise.resolve(true)),
		open: (tabId, url) => loadVia(tabId, () => tabs.update(tabId, { url })),
		reload: (tabId) => loadVia(tabId, () => tabs.reload(tabId)),
		waitLoaded: (tabId, timeoutMs) =>
			new Promise<boolean>((resolve) => {
				const finish = (ok: boolean) => {
					tabs.onUpdated.removeListener(onUpdated);
					clearTimeout(timer);
					resolve(ok);
				};
				const timer = setTimeout(() => finish(false), timeoutMs);
				function onUpdated(id: number, info: { status?: string }) {
					if (id === tabId && info.status === 'complete') finish(true);
				}
				tabs.onUpdated.addListener(onUpdated);
				tabs.get(tabId).then(
					(t) => t.status === 'complete' && finish(true),
					() => finish(false)
				);
			}),
		probe: (tabId, kind, slug) => run<PageProbe>(tabId, probePage as never, [kind, slug]),
		capture: (tabId, kind, slug) => run<PageCapture>(tabId, capturePage as never, [kind, slug])
	};
}
