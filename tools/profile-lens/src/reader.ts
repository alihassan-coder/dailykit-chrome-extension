// Reads a whole profile: the page you are on, then each full-list page it cuts short (experience,
// certifications, ...) and the activity page, in the same tab, one at a time, and finally back to the profile.
// One profile per click, at a person's pace: no background crawling, nothing LinkedIn would see as a bot run.
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
	capture(tabId: number, kind: PageKind): Promise<PageCapture>;
}

export type ReadStep = { label: string; done: number; total: number };

export async function readProfile(
	tabId: number,
	tab: TabDriver,
	options: { posts: boolean; onStep?: (step: ReadStep) => void; signal?: AbortSignal }
): Promise<ProfileSnapshot> {
	const slug = profileSlug(await tab.url(tabId));
	if (!slug) throw new ProfileError('not-profile');

	let total = 1 + (options.posts ? 1 : 0);
	let done = 0;
	const step = (label: string) => options.onStep?.({ label, done: done++, total });
	const stopIfAsked = () => {
		if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
	};

	step('Reading the profile');
	const profile = await tab.capture(tabId, 'profile');
	// Fail early on a sign-in wall or a missing profile, before opening any more pages.
	buildSnapshot(slug, profile, [], null);
	// Only lists the profile cut short need their own page; short ones are already complete.
	const pages = DETAIL_PAGES.filter((p) => profile.detailLinks.includes(p.id));
	total += pages.length;

	const details: { heading: string; capture: PageCapture }[] = [];
	let posts: PageCapture | null = null;
	try {
		for (const page of pages) {
			stopIfAsked();
			step(`Reading ${page.heading.toLowerCase()}`);
			await tab.open(tabId, detailUrl(slug, page.id));
			const capture = await tab.capture(tabId, 'details');
			// LinkedIn sends you back to the profile when a person has no such list; that is not an error.
			if (capture.url.includes(`/details/${page.id}`)) details.push({ heading: page.heading, capture });
		}
		if (options.posts) {
			stopIfAsked();
			step('Reading recent posts');
			await tab.open(tabId, postsUrl(slug));
			posts = await tab.capture(tabId, 'posts');
		}
	} finally {
		await tab.open(tabId, profileUrl(slug)).catch(() => {});
	}
	return buildSnapshot(slug, profile, details, posts);
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
		func: (kind: PageKind) => Promise<PageCapture>;
		args: [PageKind];
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
					reject(new Error('LinkedIn took too long to load. Check your connection and try again.'));
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
		async capture(tabId, kind) {
			const [frame] = await scripting.executeScript({ target: { tabId }, func: capturePage, args: [kind] });
			if (!frame?.result) throw new ProfileError('empty');
			return frame.result as PageCapture;
		}
	};
}
