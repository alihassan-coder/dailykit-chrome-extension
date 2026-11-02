// Profile lens in the side panel: pick a question set, click Analyze on a LinkedIn profile, read the answers,
// then keep asking. Every analysis is saved (encrypted, synced) per person and question set, and can be
// reopened from History. A snapshot read in the last 7 days is reused, so switching sets doesn't re-read LinkedIn.
// When the tab isn't on a profile, the panel says why and offers the way there: the profiles linked from the
// LinkedIn page you're on, your recent ones, sign-in, or access to linkedin.com.
import { ModelPicker, useModels } from '@toolbelt/ai';
import {
	AppFailure,
	PROVIDERS,
	appError,
	describeError,
	featureOn,
	isClaudeSetupToken,
	timeAgo,
	toAppError,
	type AppError,
	type AppErrorAction,
	type ErrorContext
} from '@toolbelt/core';
import {
	Badge,
	Button,
	Card,
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	EmptyRow,
	EmptyState,
	ErrorNotice,
	IconButton,
	Input,
	Notice,
	Section,
	Select,
	Skeleton,
	Textarea,
	localArea,
	showError,
	toast,
	useSettings,
	useStickToBottom
} from '@toolbelt/ui';
import {
	ArrowUp,
	Copy,
	ExternalLink,
	History,
	KeyRound,
	ListChecks,
	MessageSquareText,
	MoreHorizontal,
	Plus,
	RefreshCw,
	RotateCcw,
	ScanSearch,
	Sparkles,
	Square,
	Trash2
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
	analyzeProfile,
	askAboutProfile,
	chatForRetry,
	draftOutreach,
	readReply,
	type ChatMessage
} from './analyze.ts';
import { newId, validateSet, type Analysis, type QuestionSet } from './fields.ts';
import { Markdown } from './Markdown.tsx';
import {
	ProfileError,
	findProfileLinks,
	isLinkedIn,
	isSignInUrl,
	profileSlug,
	profileUrl,
	type ProfileLink,
	type ProfileSnapshot
} from './profile.ts';
import { browserTabs, readProfile, type ReadStep } from './reader.ts';
import { Avatar, Identity, Results, VERDICT } from './Results.tsx';
import { SetEditor } from './SetEditor.tsx';
import { LINKEDIN_SITES } from './sites.ts';
import { SNAPSHOT_MAX_AGE_MS, entryKey, profileLensStore, type IndexEntry, type SavedAnalysis } from './store.ts';
import { computeFacts } from './structured.ts';
import { SubHeader } from './SubHeader.tsx';

const store = profileLensStore(localArea);
// Tool packages cannot see the app's generated page types; the dashboard is options.html in the Toolbelt app.
const dashboardUrl = (section: string) =>
	(browser.runtime as unknown as { getURL(path: string): string }).getURL(`/options.html#${section}`);
/** The profile's tag in chat prompts: fixed per analysis (so Anthropic can cache it), unguessable to the profile. */
const SESSION = Math.random().toString(36).slice(2, 8);
const chatTag = (r: SavedAnalysis) => `linkedin_profile_${SESSION}${r.analyzedAt.toString(36)}`;
const ICON = { strokeWidth: 1.75, 'aria-hidden': true } as const;
/** A snapshot young enough to analyse again without re-reading LinkedIn. */
const isRecent = (s: ProfileSnapshot) => Date.now() - s.capturedAt < SNAPSHOT_MAX_AGE_MS;

const newRecord = (profile: ProfileSnapshot, set: QuestionSet, analysis: Analysis): SavedAnalysis => ({
	profile,
	set,
	analysis,
	chat: [],
	analyzedAt: Date.now()
});

/** Questions for analyses saved before the model suggested its own. */
const SUGGESTIONS = [
	'Write a short connection request',
	'What should I ask them on a first call?',
	'What do they care about most right now?'
];

type View = 'analyze' | 'sets' | 'history';

/** Asks for linkedin.com access. Must run straight from a click (browsers require a user gesture). */
const requestAccess = () => browser.permissions.request({ origins: LINKEDIN_SITES });

/** Runs an error's action (open settings, sign in, grant access...). Retry is handled where the error shows. */
function runAction(kind: AppErrorAction, tabId?: number): void {
	const run = (p: Promise<unknown>) => void p.catch((e: unknown) => showError(e));
	switch (kind) {
		case 'open-ai-settings':
			return run(browser.tabs.create({ url: dashboardUrl('ai') }));
		case 'open-data-settings':
			return run(browser.tabs.create({ url: dashboardUrl('data') }));
		case 'unlock':
			return run(browser.tabs.create({ url: dashboardUrl('account') }));
		case 'sign-in-linkedin':
			return run(
				tabId !== undefined
					? browser.tabs.update(tabId, { url: 'https://www.linkedin.com/login' })
					: browser.tabs.create({ url: 'https://www.linkedin.com/login' })
			);
		case 'reload-tab':
			if (tabId !== undefined) run(browser.tabs.reload(tabId));
			return;
		case 'grant-access':
			return run(requestAccess());
		case 'retry':
			return;
	}
}

type CurrentTab = { id: number; url?: string; status?: string; slug: string | null };

/** The active tab, and the LinkedIn profile in it if there is one. Follows tab switches and page changes. */
function useCurrentTab() {
	const [tab, setTab] = useState<CurrentTab | null>(null);
	useEffect(() => {
		const check = () =>
			browser.tabs.query({ active: true, currentWindow: true }).then(
				([t]) =>
					setTab(t?.id !== undefined ? { id: t.id, url: t.url, status: t.status, slug: profileSlug(t.url) } : null),
				// No readable tab (closed window, browser page): the panel shows "open a profile".
				() => setTab(null)
			);
		const onUpdated = (_id: number, info: { url?: string; status?: string }) => {
			if (info.url || info.status) void check();
		};
		const onActivated = () => void check();
		void check();
		browser.tabs.onActivated.addListener(onActivated);
		browser.tabs.onUpdated.addListener(onUpdated);
		return () => {
			browser.tabs.onActivated.removeListener(onActivated);
			browser.tabs.onUpdated.removeListener(onUpdated);
		};
	}, []);
	return tab;
}

/**
 * Whether Toolbelt may read linkedin.com. In bundle installs host access is optional and granted per site.
 * Null while checking; true when the browser can't tell (reading then reports the real problem).
 */
function useLinkedInAccess() {
	const [access, setAccess] = useState<boolean | null>(null);
	useEffect(() => {
		const api = browser.permissions as Partial<typeof browser.permissions> | undefined;
		const check = () =>
			Promise.resolve()
				.then(() => api!.contains!({ origins: LINKEDIN_SITES }))
				.then(
					(ok) => setAccess(ok !== false),
					() => setAccess(true)
				);
		void check();
		const events = [api?.onAdded, api?.onRemoved].filter((e) => typeof e?.addListener === 'function');
		try {
			for (const e of events) e!.addListener(check);
		} catch {
			// The browser has no permission events: the check above still ran, and reading reports changes.
		}
		window.addEventListener('focus', check);
		return () => {
			window.removeEventListener('focus', check);
			try {
				for (const e of events) e!.removeListener(check);
			} catch {
				// Nothing was added, so nothing to remove.
			}
		};
	}, []);
	return access;
}

/** Profiles linked from the LinkedIn page in the tab, when it isn't a profile itself (search, feed, messages). */
function useProfileLinks(tab: CurrentTab | null, access: boolean | null) {
	const [found, setFound] = useState<{ key: string; links: ProfileLink[] } | null>(null);
	const id = tab?.id;
	const url = tab?.url;
	const scan =
		access === true && !!url && isLinkedIn(url) && !tab?.slug && !isSignInUrl(url) && tab?.status === 'complete';
	const key = `${id}|${url}`;
	useEffect(() => {
		if (!scan || id === undefined) return;
		let live = true;
		Promise.resolve()
			.then(() => browser.scripting.executeScript({ target: { tabId: id }, func: findProfileLinks }))
			.then(
				([frame]) =>
					live && setFound({ key, links: Array.isArray(frame?.result) ? (frame.result as ProfileLink[]) : [] }),
				// Only suggestions: if the page can't be read, the panel still says how to open a profile.
				() => live && setFound({ key, links: [] })
			);
		return () => {
			live = false;
		};
	}, [scan, id, key]);
	return scan && found?.key === key ? found.links : [];
}

function Progress({ step, onStop }: { step: ReadStep | 'thinking'; onStop: () => void }) {
	const label =
		step === 'thinking'
			? 'Analysing with AI…'
			: step.waiting
				? `${step.label}…`
				: `${step.label} (${step.done + 1}/${step.total})…`;
	const share = step === 'thinking' ? 0.92 : (step.done + 0.5) / (step.total + 1);
	return (
		<div
			role="status"
			className="relative flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-line bg-surface pr-1 pl-2.5"
		>
			<span className="tb-num min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
			<Button size="xs" variant="quiet" icon={<Square {...ICON} />} onClick={onStop}>
				Stop
			</Button>
			<span className="absolute inset-x-0 bottom-0 h-0.5 bg-soft" aria-hidden="true">
				<span className="block h-full bg-accent transition-[width] duration-500" style={{ width: `${share * 100}%` }} />
			</span>
		</div>
	);
}

/** A profile to go to: one row, opens it in the tab; the second button opens it and analyses straight away. */
function ProfileRow({
	name,
	slug,
	meta,
	onOpen,
	onAnalyze
}: {
	name: string;
	slug: string;
	meta?: string;
	onOpen: () => void;
	onAnalyze?: () => void;
}) {
	return (
		<li className="group relative flex h-9 min-w-0 items-center">
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${name || slug}’s profile`}
				className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left outline-none hover:bg-hover focus-visible:bg-hover"
			>
				<Avatar name={name || slug} size={24} />
				<span className="min-w-0 flex-1 truncate font-medium text-ink">{name || `linkedin.com/in/${slug}`}</span>
				{meta && (
					<span className="tb-num shrink-0 text-sm text-faint group-focus-within:invisible group-hover:invisible">
						{meta}
					</span>
				)}
			</button>
			{onAnalyze && (
				<div className="absolute right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
					<IconButton label={`Open and analyze ${name || slug}`} size="xs" onClick={onAnalyze}>
						<ScanSearch className="size-4" {...ICON} />
					</IconButton>
				</div>
			)}
		</li>
	);
}

/** What to do when the tab isn't on a profile. */
function TabState({
	tab,
	links,
	recent,
	onOpen,
	onAnalyze
}: {
	tab: CurrentTab | null;
	links: ProfileLink[];
	recent: IndexEntry[];
	onOpen: (slug: string) => void;
	onAnalyze: (slug: string) => void;
}) {
	const onLinkedIn = isLinkedIn(tab?.url);
	const people = links.slice(0, 4);
	const recentPeople = recent.filter((r) => !people.some((p) => p.slug === r.slug)).slice(0, 3);
	return (
		<div className="grid gap-2.5">
			<Notice
				tone="info"
				title={onLinkedIn ? 'This LinkedIn page isn’t a profile' : 'Open a LinkedIn profile'}
				action={
					!onLinkedIn ? (
						<Button
							size="xs"
							variant="plain"
							icon={<ExternalLink {...ICON} />}
							onClick={() =>
								void browser.tabs.create({ url: 'https://www.linkedin.com/feed/' }).catch((e: unknown) => showError(e))
							}
						>
							Open LinkedIn
						</Button>
					) : undefined
				}
			>
				{people.length
					? 'Pick someone from this page, or open a LinkedIn profile, then press Analyze.'
					: 'Open a LinkedIn profile, then press Analyze.'}
			</Notice>
			{people.length > 0 && (
				<Section title="On this page" count={people.length}>
					<Card list>
						<ul className="divide-y divide-line">
							{people.map((p) => (
								<ProfileRow
									key={p.slug}
									name={p.name}
									slug={p.slug}
									onOpen={() => onOpen(p.slug)}
									onAnalyze={() => onAnalyze(p.slug)}
								/>
							))}
						</ul>
					</Card>
				</Section>
			)}
			{recentPeople.length > 0 && (
				<Section title="Recent">
					<Card list>
						<ul className="divide-y divide-line">
							{recentPeople.map((r) => (
								<ProfileRow
									key={r.slug}
									name={r.name}
									slug={r.slug}
									meta={timeAgo(r.analyzedAt)}
									onOpen={() => onOpen(r.slug)}
								/>
							))}
						</ul>
					</Card>
				</Section>
			)}
		</div>
	);
}

function HistoryList({ onOpen, onBack }: { onOpen: (entry: IndexEntry) => void; onBack: () => void }) {
	const [entries, setEntries] = useState<IndexEntry[] | null>(null);
	const [failed, setFailed] = useState<AppError | null>(null);
	const [query, setQuery] = useState('');
	const [deleting, setDeleting] = useState<IndexEntry | null>(null);
	const load = useCallback(() => {
		store.index.get().then(setEntries, (e: unknown) => setFailed(describeError(e)));
	}, []);
	useEffect(() => {
		load();
		return store.index.subscribe(setEntries);
	}, [load]);

	const q = query.trim().toLowerCase();
	const shown = (entries ?? []).filter((e) => !q || `${e.name} ${e.headline} ${e.setName}`.toLowerCase().includes(q));

	return (
		<div className="grid min-w-0 gap-2">
			<SubHeader title="History" onBack={onBack} meta={entries?.length || undefined} />
			{failed ? (
				<ErrorNotice
					error={failed}
					onAction={(k) => {
						if (k !== 'retry') return;
						setFailed(null);
						load();
					}}
				/>
			) : !entries ? (
				<div className="grid gap-1" aria-busy="true">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-11" />
					))}
				</div>
			) : entries.length === 0 ? (
				<EmptyState title="Nothing analysed yet" body="Profiles you analyse are kept here, on all your devices." />
			) : (
				<>
					<Input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by name, headline or set"
						aria-label="Search history"
						className="h-7"
					/>
					{shown.length === 0 ? (
						<EmptyRow>No profiles match “{query.trim()}”.</EmptyRow>
					) : (
						<Card list>
							<ul className="divide-y divide-line">
								{shown.map((e) => {
									const v = VERDICT[e.verdict] ?? VERDICT.no;
									return (
										<li key={entryKey(e)} className="group relative flex h-11 min-w-0 items-center">
											<button
												type="button"
												onClick={() => onOpen(e)}
												className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left outline-none hover:bg-hover focus-visible:bg-hover"
											>
												<Avatar src={e.photo} name={e.name} size={24} />
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium text-ink">{e.name}</span>
													<span className="block truncate text-sm text-faint">
														{e.setName}
														{e.headline && ` · ${e.headline}`}
													</span>
												</span>
												<Badge tone={v.tone}>
													{v.short} <span className="tb-num">{e.score}</span>
												</Badge>
												<span className="tb-num w-16 shrink-0 truncate text-right text-sm text-faint group-focus-within:invisible group-hover:invisible">
													{timeAgo(e.analyzedAt)}
												</span>
											</button>
											<div className="absolute right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
												<IconButton label={`Delete ${e.name}`} size="xs" onClick={() => setDeleting(e)}>
													<Trash2 className="size-4" {...ICON} />
												</IconButton>
											</div>
										</li>
									);
								})}
							</ul>
						</Card>
					)}
				</>
			)}
			<ConfirmDialog
				open={!!deleting}
				onOpenChange={(o) => !o && setDeleting(null)}
				title={`Delete ${deleting?.name ?? ''}?`}
				description={`The “${deleting?.setName ?? ''}” analysis and its chat are removed from all your devices.`}
				confirmLabel="Delete"
				onConfirm={() => {
					if (deleting) store.remove(deleting.slug, deleting.setId || undefined).catch((e: unknown) => showError(e));
				}}
			/>
		</div>
	);
}

/** The outreach draft for one analysis: made on demand, kept while the panel is open. */
type Draft = { key: string; text: string; loading: boolean; error: AppError | null };

function OutreachDialog({
	open,
	onOpenChange,
	name,
	setName,
	draft,
	onChange,
	onRegenerate,
	onAction
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	setName: string;
	draft: Draft | null;
	onChange: (text: string) => void;
	onRegenerate: () => void;
	onAction: (kind: AppErrorAction) => void;
}) {
	const text = draft?.text ?? '';
	const copy = () =>
		navigator.clipboard.writeText(text).then(
			() => toast.success('Message copied'),
			(e: unknown) => showError(e)
		);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Outreach message</DialogTitle>
					<DialogDescription>
						For {name}, written for “{setName}”. Edit it before you send it.
					</DialogDescription>
				</DialogHeader>
				{draft?.error ? (
					<ErrorNotice error={draft.error} onAction={(k) => (k === 'retry' ? onRegenerate() : onAction(k))} />
				) : draft?.loading && !text ? (
					<div className="grid gap-1.5" aria-busy="true" aria-label="Writing the message">
						<Skeleton className="h-4" />
						<Skeleton className="h-4" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				) : (
					<Textarea
						value={text}
						onChange={(e) => onChange(e.target.value)}
						aria-label="Outreach message"
						rows={6}
						className={draft?.loading ? 'opacity-50' : undefined}
					/>
				)}
				<DialogFooter>
					<span className="tb-num mr-auto self-center text-sm text-faint">
						{text ? `${text.trim().split(/\s+/).length} words` : ''}
					</span>
					<Button
						size="sm"
						variant="quiet"
						icon={<RefreshCw {...ICON} />}
						loading={!!draft?.loading}
						onClick={onRegenerate}
					>
						Rewrite
					</Button>
					<Button
						size="sm"
						variant="primary"
						icon={<Copy {...ICON} />}
						disabled={!text.trim()}
						onClick={() => void copy()}
					>
						Copy
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Loading() {
	return (
		<div className="grid gap-3" aria-busy="true" aria-label="Loading Profile lens">
			<div className="flex gap-1">
				<Skeleton className="h-7 flex-1" />
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-7 w-20" />
			</div>
			<Skeleton className="h-7" />
			<Skeleton className="h-24" />
		</div>
	);
}

export default function ProfileLensPanel() {
	const { settings } = useSettings();
	const ai = useModels('profile-lens');
	const tab = useCurrentTab();
	const access = useLinkedInAccess();
	const links = useProfileLinks(tab, access);
	const act = (kind: AppErrorAction) => runAction(kind, tab?.id);
	const [view, setView] = useState<View>('analyze');
	const [sets, setSets] = useState<QuestionSet[] | null>(null);
	const [bootError, setBootError] = useState<AppError | null>(null);
	const [activeId, setActiveId] = useState<string>('');
	const [record, setRecord] = useState<SavedAnalysis | null>(null);
	/** Opened from History: stays on screen even if the tab shows someone else. */
	const [pinned, setPinned] = useState(false);
	const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
	const [busy, setBusy] = useState<ReadStep | 'thinking' | null>(null);
	const [error, setError] = useState<AppError | null>(null);
	const [question, setQuestion] = useState('');
	const [answering, setAnswering] = useState(false);
	const [chatError, setChatError] = useState<AppError | null>(null);
	const [recent, setRecent] = useState<IndexEntry[]>([]);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [draftOpen, setDraftOpen] = useState(false);
	const abort = useRef<AbortController | null>(null);
	const chatAbort = useRef<AbortController | null>(null);
	const draftAbort = useRef<AbortController | null>(null);
	const loadSeq = useRef(0);
	const pinToBottom = useStickToBottom([record?.chat]);

	const loadSets = useCallback(() => {
		Promise.all([store.sets.get(), store.activeSet.get()]).then(
			([s, id]) => {
				setSets(s);
				setActiveId(id && s.some((x) => x.id === id) ? id : s[0]!.id);
			},
			(e: unknown) => setBootError(describeError(e))
		);
	}, []);
	useEffect(loadSets, [loadSets]);

	// Recently analysed people, offered when the tab isn't on a profile.
	useEffect(() => {
		const keep = (list: IndexEntry[]) =>
			setRecent(list.filter((e, i) => list.findIndex((x) => x.slug === e.slug) === i).slice(0, 5));
		store.index.get().then(keep, (e: unknown) => showError(e));
		return store.index.subscribe(keep);
	}, []);

	/** Shows the saved analysis (and the last snapshot) for this person. */
	const showSaved = useCallback((slug: string, setId: string, fromTab: boolean) => {
		const seq = ++loadSeq.current;
		Promise.all([fromTab ? store.loadBest(slug, setId) : store.load(slug, setId), store.snapshot(slug)]).then(
			([saved, snap]) => {
				if (seq !== loadSeq.current) return;
				if (fromTab) {
					setPinned(false);
					setError(null);
				}
				setRecord(saved);
				setSnapshot(snap);
			},
			(e: unknown) => showError(e, { onAction: (k) => runAction(k) })
		);
	}, []);

	// Show the saved analysis for whoever is open in the tab, if there is one.
	const tabSlug = tab?.slug ?? null;
	const ready = !!sets;
	useEffect(() => {
		if (!tabSlug || !ready || busy) return;
		showSaved(tabSlug, activeId, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabSlug, ready]);

	if (bootError)
		return (
			<ErrorNotice
				error={bootError}
				onAction={(k) => {
					if (k !== 'retry') return act(k);
					setBootError(null);
					loadSets();
				}}
			/>
		);
	if (!sets || !ai.keys) return <Loading />;
	const set = sets.find((s) => s.id === activeId) ?? sets[0]!;
	const choice = ai.choice;

	if (!choice) {
		return (
			<EmptyState
				title="Connect an AI provider"
				body="Profile lens uses the same provider API keys as the agent."
				action={
					<Button variant="primary" icon={<KeyRound {...ICON} />} onClick={() => act('open-ai-settings')}>
						Connect a provider
					</Button>
				}
			/>
		);
	}

	const ctx: ErrorContext = {
		provider: PROVIDERS.find((p) => p.id === choice.provider)?.name,
		model: choice.model,
		setupToken: choice.provider === 'anthropic' && isClaudeSetupToken(ai.keys.anthropic ?? '')
	};

	function saveSets(next: QuestionSet[], id: string) {
		setSets(next);
		setActiveId(id);
		Promise.all([store.sets.set(next), store.activeSet.set(id)]).catch((e: unknown) =>
			showError(e, { ctx, onAction: act })
		);
	}

	function chooseSet(id: string) {
		saveSets(sets!, id);
		const slug = pinned && record ? record.profile.slug : tabSlug;
		if (slug && !busy) showSaved(slug, id, false);
	}

	function newSet() {
		const fresh: QuestionSet = { id: newId(), name: 'New set', icp: '', fields: [] };
		saveSets([...sets!, fresh], fresh.id);
		setView('sets');
	}

	function savedFailed(e: unknown) {
		const app = toAppError(e, ctx);
		showError(
			new AppFailure({
				...app,
				title: 'Couldn’t save to history',
				message: app.code === 'storage_full' ? app.message : 'The result is shown here, but it isn’t in History.'
			}),
			{ onAction: act }
		);
	}

	const issues = validateSet(set);
	const onProfile = !!tab?.slug;
	const signInPage = isSignInUrl(tab?.url);
	const showing = record && (pinned || !onProfile || record.profile.slug === tab?.slug) ? record : null;

	async function analyze(reread = false, target?: string) {
		const slug = target ?? tab?.slug;
		if (!tab || !slug || busy || issues.length) return;
		setError(null);
		const controller = new AbortController();
		abort.current = controller;
		const { signal } = controller;
		try {
			const fresh = !reread && slug === tab.slug && snapshot?.slug === slug && isRecent(snapshot);
			let profile = fresh ? snapshot : null;
			if (!profile) {
				const driver = browserTabs(browser.tabs as never, browser.scripting as never, browser.permissions as never);
				setBusy({ label: 'Checking the tab', done: 0, total: 1, waiting: true });
				profile = await readProfile(tab.id, driver, {
					slug,
					posts: featureOn(settings, 'profile-lens', 'posts'),
					onStep: setBusy,
					signal,
					onReturnFailed: () =>
						showError(
							new AppFailure(
								appError('tab_gone', ctx, {
									title: 'Couldn’t go back to the profile',
									message: 'The analysis is fine; open the profile again in the tab if you need it.',
									action: undefined
								})
							)
						)
				});
				setSnapshot(profile);
			}
			setBusy('thinking');
			const analysis = await analyzeProfile({ model: ai.model(), profile, set, signal });
			const next = newRecord(profile, set, analysis);
			setRecord(next);
			setPinned(false);
			setChatError(null);
			store.save(next).catch(savedFailed);
		} catch (e) {
			const app = describeError(e, ctx);
			setError(
				app.code === 'aborted' ? { ...app, message: 'Nothing was saved. The tab is back on the profile.' } : app
			);
		} finally {
			setBusy(null);
		}
	}

	/** An analysis error's action. Access is asked for straight from the click, then the read runs again. */
	function onAnalyzeAction(kind: AppErrorAction) {
		if (kind === 'retry') return void analyze();
		if (kind === 'grant-access') {
			requestAccess().then(
				(granted) => {
					if (granted) {
						setError(null);
						void analyze();
					}
				},
				(e: unknown) => showError(e)
			);
			return;
		}
		act(kind);
	}

	function openProfile(slug: string) {
		if (!tab) return;
		browser.tabs.update(tab.id, { url: profileUrl(slug) }).catch((e: unknown) => showError(e, { ctx }));
	}

	function persistChat(base: SavedAnalysis, chat: ChatMessage[]) {
		store.saveChat(base.profile.slug, base.set.id, chat).catch((e: unknown) => showError(e, { ctx, onAction: act }));
	}

	/** Answers the last question in `chat` (which ends with the user's message). */
	async function runChat(base: SavedAnalysis, chat: ChatMessage[]) {
		setChatError(null);
		setAnswering(true);
		pinToBottom();
		setRecord({ ...base, chat });
		const controller = new AbortController();
		chatAbort.current = controller;
		let reply = '';
		const withReply = (text: string): ChatMessage[] => [...chat, { role: 'assistant', text }];
		try {
			const result = askAboutProfile({
				model: ai.model(),
				...base,
				chat,
				signal: controller.signal,
				provider: choice!.provider,
				tag: chatTag(base)
			});
			await readReply(result, (text) => {
				reply = text;
				setRecord((r) => r && { ...r, chat: withReply(text) });
			});
			if (!reply.trim())
				throw new AppFailure(
					appError('bad_output', ctx, {
						title: 'No answer came back',
						message: 'The model finished without any text. Try again, or pick another model.'
					})
				);
			persistChat(base, withReply(reply));
		} catch (err) {
			// Stopped: keep (and save) whatever arrived. Failed: drop the partial reply and offer Retry.
			const final = controller.signal.aborted && reply.trim() ? withReply(reply) : chat;
			setRecord((r) => r && { ...r, chat: final });
			persistChat(base, final);
			if (!controller.signal.aborted) setChatError(describeError(err, ctx));
		} finally {
			setAnswering(false);
		}
	}

	function ask(e?: FormEvent, text = question) {
		e?.preventDefault();
		const q = text.trim();
		if (!q || !showing || answering) return;
		setQuestion('');
		void runChat(showing, [...showing.chat, { role: 'user', text: q }]);
	}

	function retryChat() {
		const chat = showing && chatForRetry(showing.chat);
		if (showing && chat && !answering) void runChat(showing, chat);
	}

	/** Writes (or rewrites) the outreach message for what's on screen. */
	function writeDraft(base: SavedAnalysis) {
		draftAbort.current?.abort();
		const controller = new AbortController();
		draftAbort.current = controller;
		const key = `${entryKey({ slug: base.profile.slug, setId: base.set.id })}|${base.analyzedAt}`;
		setDraft((d) => ({ key, text: d?.key === key ? d.text : '', loading: true, error: null }));
		const run = async () => draftOutreach({ model: ai.model(), ...base, signal: controller.signal });
		run().then(
			(text) => !controller.signal.aborted && setDraft({ key, text, loading: false, error: null }),
			(e: unknown) => {
				if (controller.signal.aborted) return;
				setDraft((d) => ({ key, text: d?.text ?? '', loading: false, error: describeError(e, ctx) }));
			}
		);
	}

	function openDraft() {
		if (!showing) return;
		setDraftOpen(true);
		const key = `${entryKey({ slug: showing.profile.slug, setId: showing.set.id })}|${showing.analyzedAt}`;
		if (draft?.key !== key || (!draft.text && !draft.loading)) writeDraft(showing);
	}

	function copySummary() {
		if (!showing) return;
		const a = showing.analysis;
		const text = [
			`${showing.profile.name} — ${a.facts.headline}`,
			a.summary,
			`${VERDICT[a.icp.verdict]?.label ?? ''} (${a.icp.score}/100) for “${showing.set.name}”`,
			...a.icp.reasons.map((r) => `- ${r}`),
			showing.profile.url
		]
			.filter(Boolean)
			.join('\n');
		navigator.clipboard.writeText(text).then(
			() => toast.success('Summary copied'),
			(e: unknown) => showError(e)
		);
	}

	if (view === 'sets') {
		return <SetEditor sets={sets} activeId={set.id} onChange={saveSets} onDone={() => setView('analyze')} />;
	}
	if (view === 'history') {
		return (
			<HistoryList
				onBack={() => setView('analyze')}
				onOpen={(entry) =>
					store.load(entry.slug, entry.setId || null).then(
						(saved) => {
							if (saved) {
								loadSeq.current++;
								setRecord(saved);
								setPinned(true);
								setError(null);
								setChatError(null);
								if (sets.some((s) => s.id === saved.set.id)) saveSets(sets, saved.set.id);
							}
							setView('analyze');
						},
						(e: unknown) => showError(e, { ctx, onAction: act })
					)
				}
			/>
		);
	}

	const again = !!showing && showing.profile.slug === tab?.slug;
	const tabSnapshot = snapshot?.slug === tab?.slug ? snapshot : null;
	const gaps = showing?.profile.gaps ?? [];
	const asked = new Set(showing?.chat.filter((m) => m.role === 'user').map((m) => m.text));
	const followUps = (showing?.analysis.followUps?.length ? showing.analysis.followUps : SUGGESTIONS).filter(
		(q) => !asked.has(q)
	);
	const firstName = showing?.profile.name.split(' ')[0] ?? '';

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-2.5">
			<div className="flex min-w-0 flex-wrap items-center gap-1">
				<div className="min-w-0 flex-1 basis-28">
					<Select
						label="Question set"
						size="sm"
						value={set.id}
						onChange={chooseSet}
						options={sets.map((s) => ({ value: s.id, label: s.name || 'Untitled set' }))}
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton label="More">
							<MoreHorizontal className="size-4" {...ICON} />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onSelect={() => setView('sets')}>
							<ListChecks {...ICON} /> Edit question sets
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={newSet}>
							<Plus {...ICON} /> New set
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={!onProfile || !!busy || issues.length > 0} onSelect={() => void analyze(true)}>
							<RefreshCw {...ICON} /> Re-read profile and analyze
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setView('history')}>
							<History {...ICON} /> History
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<IconButton label="History" onClick={() => setView('history')}>
					<History className="size-4" {...ICON} />
				</IconButton>
				<div className="min-w-0 shrink">
					<ModelPicker
						models={ai.models}
						choice={choice}
						onChoose={ai.choose}
						onRefresh={ai.refresh}
						refreshing={ai.refreshing}
						note={ai.note}
					/>
				</div>
				<Button
					size="sm"
					variant="primary"
					loading={!!busy}
					icon={again ? <RotateCcw {...ICON} /> : <ScanSearch {...ICON} />}
					disabled={!onProfile || issues.length > 0}
					aria-label={again ? 'Analyze again' : 'Analyze this profile'}
					onClick={() => void analyze()}
				>
					{again ? 'Analyze again' : 'Analyze'}
				</Button>
			</div>

			{busy && <Progress step={busy} onStop={() => abort.current?.abort()} />}

			{issues.length > 0 && (
				<Notice
					tone="warn"
					title={`“${set.name || 'Untitled set'}” isn’t ready to use`}
					action={
						<Button size="xs" variant="plain" onClick={() => setView('sets')}>
							Edit set
						</Button>
					}
				>
					{issues[0]!.message}
					{issues.length > 1 && ` And ${issues.length - 1} more.`}
				</Notice>
			)}

			{error && <ErrorNotice error={error} onAction={onAnalyzeAction} onDismiss={() => setError(null)} />}

			{access === false && !error ? (
				<ErrorNotice error={new ProfileError('no-access').app} onAction={onAnalyzeAction} />
			) : signInPage && !showing && !error ? (
				<ErrorNotice error={new ProfileError('signed-out').app} onAction={act} />
			) : showing ? (
				<Identity
					name={showing.profile.name}
					photo={showing.profile.photo}
					headline={showing.analysis.facts.headline}
					url={showing.profile.url}
					meta={
						<span className="flex items-center gap-1">
							<span className="tb-num">{timeAgo(showing.analyzedAt)}</span>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<IconButton label="Result actions" size="xs">
										<MoreHorizontal className="size-4" {...ICON} />
									</IconButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onSelect={openDraft}>
										<MessageSquareText {...ICON} /> Draft outreach message
									</DropdownMenuItem>
									<DropdownMenuItem onSelect={copySummary}>
										<Copy {...ICON} /> Copy summary
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										disabled={!again || !!busy || issues.length > 0}
										onSelect={() => void analyze(true)}
									>
										<RefreshCw {...ICON} /> Re-read profile and analyze
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</span>
					}
				/>
			) : tabSnapshot ? (
				<Identity
					name={tabSnapshot.name}
					photo={tabSnapshot.photo}
					headline={`linkedin.com/in/${tabSnapshot.slug}`}
					url={tabSnapshot.url}
					meta="Not analysed with this set"
				/>
			) : onProfile ? (
				<div className="flex min-w-0 items-center gap-2">
					<Avatar name={tab!.slug!} />
					<span className="min-w-0 flex-1 truncate text-sm text-muted">linkedin.com/in/{tab!.slug}</span>
					<span className="shrink-0 text-sm text-faint">
						{tab?.status === 'loading' ? 'LinkedIn is loading…' : 'Not analysed yet'}
					</span>
				</div>
			) : (
				!busy && (
					<TabState
						tab={tab}
						links={links}
						recent={recent}
						onOpen={openProfile}
						onAnalyze={(slug) => void analyze(false, slug)}
					/>
				)
			)}

			{showing && (
				// While it analyses again, the old results stay in place (dimmed) instead of the page collapsing.
				<div
					aria-busy={!!busy}
					className={`flex min-w-0 flex-1 flex-col gap-3 transition-opacity ${busy ? 'pointer-events-none opacity-50' : ''}`}
				>
					{gaps.length > 0 && (
						<ErrorNotice
							error={appError('linkedin_partial', ctx, {
								message: `Couldn’t read: ${gaps.join(', ')}. The analysis used what loaded.`,
								action: { label: 'Re-read profile', kind: 'retry' }
							})}
							onAction={again ? (k) => (k === 'retry' ? void analyze(true) : act(k)) : undefined}
						/>
					)}
					<Results
						set={showing.set}
						analysis={showing.analysis}
						facts={showing.profile.structured ? computeFacts(showing.profile.structured) : undefined}
					/>
					<p className="text-xs text-faint">
						Analysed <span className="tb-num">{timeAgo(showing.analyzedAt)}</span> with “{showing.set.name}” · profile
						read <span className="tb-num">{timeAgo(showing.profile.capturedAt)}</span>
					</p>

					<section aria-label="Ask about this person" className="flex min-w-0 flex-1 flex-col gap-2">
						{showing.chat.map((m, i) =>
							m.role === 'user' ? (
								<p
									key={i}
									data-role="user"
									className="ml-8 self-end rounded-lg bg-soft px-3 py-1.5 text-base whitespace-pre-wrap wrap-anywhere text-ink"
								>
									{m.text}
								</p>
							) : (
								<div key={i} data-role="assistant" className="mr-4 text-base leading-relaxed wrap-anywhere text-ink">
									<Markdown text={m.text} />
								</div>
							)
						)}
						{answering && showing.chat.at(-1)?.role === 'user' && (
							<p role="status" className="text-sm text-faint">
								Thinking…
							</p>
						)}
						{chatError && (
							<ErrorNotice
								error={chatError}
								onAction={(k) => (k === 'retry' ? retryChat() : act(k))}
								onDismiss={() => setChatError(null)}
							/>
						)}
						{!answering && followUps.length > 0 && (
							<div className="grid gap-1">
								{showing.chat.length === 0 && (
									<span className="flex items-center gap-1 text-xs font-medium text-faint">
										<Sparkles className="size-3.5" aria-hidden="true" /> Ask next
									</span>
								)}
								<div className="flex flex-wrap gap-1">
									{followUps.slice(0, 3).map((s) => (
										<button
											key={s}
											type="button"
											onClick={() => ask(undefined, s)}
											className="min-h-7 max-w-full rounded-md border border-line bg-surface px-2 py-1 text-left text-sm text-muted hover:bg-hover hover:text-ink"
										>
											{s}
										</button>
									))}
								</div>
							</div>
						)}
						<form onSubmit={(e) => ask(e)} className="sticky bottom-0 -mx-3 mt-auto bg-bg px-3 pt-1 pb-3">
							<div className="relative rounded-lg border border-line bg-surface shadow-xs transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
								<textarea
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
											e.preventDefault();
											e.currentTarget.form?.requestSubmit();
										}
									}}
									rows={1}
									placeholder={`Ask about ${firstName}…`}
									aria-label="Ask about this person"
									className="block max-h-40 min-h-9 w-full resize-none bg-transparent py-2 pr-10 pl-3 text-base text-ink outline-none [field-sizing:content] placeholder:text-faint"
								/>
								<div className="absolute right-1 bottom-1">
									{answering ? (
										<IconButton label="Stop answering" side="top" onClick={() => chatAbort.current?.abort()}>
											<Square className="size-3.5" aria-hidden="true" />
										</IconButton>
									) : (
										<IconButton
											label="Send"
											hint="Enter"
											side="top"
											type="submit"
											disabled={!question.trim()}
											className="bg-accent text-on-accent hover:bg-accent/90 disabled:bg-soft disabled:text-faint"
										>
											<ArrowUp className="size-4" {...ICON} />
										</IconButton>
									)}
								</div>
							</div>
						</form>
					</section>
					<OutreachDialog
						open={draftOpen}
						onOpenChange={(o) => {
							setDraftOpen(o);
							if (!o) {
								draftAbort.current?.abort();
								setDraft((d) => d && { ...d, loading: false });
							}
						}}
						name={showing.profile.name}
						setName={showing.set.name}
						draft={draft}
						onChange={(text) => setDraft((d) => d && { ...d, text })}
						onRegenerate={() => writeDraft(showing)}
						onAction={act}
					/>
				</div>
			)}
		</div>
	);
}
