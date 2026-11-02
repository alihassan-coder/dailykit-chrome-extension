// Profile lens in the side panel: pick a question set, click Analyze on a LinkedIn profile, read the answers,
// then keep asking. Every analysis is saved (encrypted, synced) per person and question set, and can be
// reopened from History. A snapshot read in the last 7 days is reused, so switching sets doesn't re-read LinkedIn.
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
	Select,
	Skeleton,
	localArea,
	showError,
	useSettings,
	useStickToBottom
} from '@toolbelt/ui';
import {
	ArrowUp,
	History,
	KeyRound,
	ListChecks,
	MoreHorizontal,
	Plus,
	RefreshCw,
	RotateCcw,
	ScanSearch,
	Square,
	Trash2
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { analyzeProfile, askAboutProfile, chatForRetry, readReply, type ChatMessage } from './analyze.ts';
import { newId, validateSet, type Analysis, type QuestionSet } from './fields.ts';
import { Markdown } from './Markdown.tsx';
import { PROBLEMS, profileSlug, type ProfileSnapshot } from './profile.ts';
import { browserTabs, readProfile, type ReadStep } from './reader.ts';
import { Avatar, Identity, Results, VERDICT } from './Results.tsx';
import { SetEditor } from './SetEditor.tsx';
import { LINKEDIN_SITES } from './sites.ts';
import { SNAPSHOT_MAX_AGE_MS, entryKey, profileLensStore, type IndexEntry, type SavedAnalysis } from './store.ts';
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

const SUGGESTIONS = [
	'Write a short connection request',
	'What should I ask them on a first call?',
	'What do they care about most right now?'
];

type View = 'analyze' | 'sets' | 'history';

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
			return run(browser.permissions.request({ origins: LINKEDIN_SITES }));
		case 'retry':
			return;
	}
}

/** The active tab, and the LinkedIn profile in it if there is one. Follows tab switches and page changes. */
function useCurrentTab() {
	const [tab, setTab] = useState<{ id: number; slug: string | null } | null>(null);
	useEffect(() => {
		const check = () =>
			browser.tabs.query({ active: true, currentWindow: true }).then(
				([t]) => setTab(t?.id !== undefined ? { id: t.id, slug: profileSlug(t.url) } : null),
				// No readable tab (closed window, browser page): the panel shows "open a profile".
				() => setTab(null)
			);
		const onUpdated = (_id: number, info: { url?: string; status?: string }) => {
			if (info.url || info.status === 'complete') void check();
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

function Progress({ step, onStop }: { step: ReadStep | 'thinking'; onStop: () => void }) {
	const label = step === 'thinking' ? 'Analysing with AI' : step.label;
	const share = step === 'thinking' ? 0.92 : (step.done + 0.5) / (step.total + 1);
	return (
		<div
			role="status"
			className="relative flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-line bg-surface pr-1 pl-2.5"
		>
			<span className="min-w-0 flex-1 truncate text-sm text-ink">{label}…</span>
			{step !== 'thinking' && (
				<span className="tb-num shrink-0 text-sm text-faint">
					{step.done + 1}/{step.total}
				</span>
			)}
			<Button size="xs" variant="quiet" icon={<Square {...ICON} />} onClick={onStop}>
				Stop
			</Button>
			<span className="absolute inset-x-0 bottom-0 h-0.5 bg-soft" aria-hidden="true">
				<span className="block h-full bg-accent transition-[width] duration-500" style={{ width: `${share * 100}%` }} />
			</span>
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
	const abort = useRef<AbortController | null>(null);
	const chatAbort = useRef<AbortController | null>(null);
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
				body="Profile lens uses the same Claude subscription or provider API keys as the agent."
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
	const showing = record && (pinned || !onProfile || record.profile.slug === tab?.slug) ? record : null;

	async function analyze(reread = false) {
		if (!tab?.slug || busy || issues.length) return;
		setError(null);
		const controller = new AbortController();
		abort.current = controller;
		const { signal } = controller;
		try {
			const fresh = !reread && snapshot?.slug === tab.slug && isRecent(snapshot);
			let profile = fresh ? snapshot : null;
			if (!profile) {
				const driver = browserTabs(browser.tabs as never, browser.scripting as never);
				profile = await readProfile(tab.id, driver, {
					posts: featureOn(settings, 'profile-lens', 'posts'),
					onStep: setBusy,
					signal
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
			setError(app.code === 'aborted' ? { ...app, message: 'Nothing was saved.' } : app);
		} finally {
			setBusy(null);
		}
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

			{error && (
				<ErrorNotice
					error={error}
					onAction={(k) => (k === 'retry' ? void analyze() : act(k))}
					onDismiss={() => setError(null)}
				/>
			)}

			{showing ? (
				<Identity
					name={showing.profile.name}
					photo={showing.profile.photo}
					headline={showing.analysis.facts.headline}
					url={showing.profile.url}
					meta={<span className="tb-num">{timeAgo(showing.analyzedAt)}</span>}
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
					<span className="shrink-0 text-sm text-faint">Not analysed yet</span>
				</div>
			) : (
				<p className="text-sm text-faint">{PROBLEMS['not-profile']}</p>
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
					<Results set={showing.set} analysis={showing.analysis} />
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
						{showing.chat.length === 0 && (
							<div className="flex flex-wrap gap-1">
								{SUGGESTIONS.map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => ask(undefined, s)}
										className="h-7 rounded-md border border-line bg-surface px-2 text-sm text-muted hover:bg-hover hover:text-ink"
									>
										{s}
									</button>
								))}
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
									placeholder={`Ask about ${showing.profile.name.split(' ')[0]}…`}
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
				</div>
			)}
		</div>
	);
}
