// Profile lens in the side panel: pick a question set, click Analyze on a LinkedIn profile, read the answers,
// then keep asking. Every analysis is saved (encrypted, synced) and can be reopened from History.
import { ModelPicker, useModels } from '@toolbelt/ai';
import { featureOn, timeAgo } from '@toolbelt/core';
import { Button, EmptyState, IconButton, Select, localArea, useSettings } from '@toolbelt/ui';
import { History, KeyRound, ListChecks, RotateCcw, ScanSearch, Send, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { analyzeProfile, askAboutProfile, type ChatMessage } from './analyze.ts';
import type { Analysis, QuestionSet } from './fields.ts';
import { PROBLEMS, ProfileError, profileSlug, type ProfileSnapshot } from './profile.ts';
import { browserTabs, readProfile, type ReadStep } from './reader.ts';
import { Results } from './Results.tsx';
import { SetEditor } from './SetEditor.tsx';
import { profileLensStore, type IndexEntry, type SavedAnalysis } from './store.ts';

const store = profileLensStore(localArea);
// Tool packages cannot see the app's generated page types; the dashboard is options.html in the Toolbelt app.
const dashboardUrl = (section: string) =>
	(browser.runtime as unknown as { getURL(path: string): string }).getURL(`/options.html#${section}`);

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

/** The active tab, and the LinkedIn profile in it if there is one. Follows tab switches and page changes. */
function useCurrentTab() {
	const [tab, setTab] = useState<{ id: number; slug: string | null } | null>(null);
	useEffect(() => {
		const check = async () => {
			const [t] = await browser.tabs.query({ active: true, currentWindow: true });
			setTab(t?.id !== undefined ? { id: t.id, slug: profileSlug(t.url) } : null);
		};
		const onUpdated = (_id: number, info: { url?: string; status?: string }) => {
			if (info.url || info.status === 'complete') void check();
		};
		void check();
		browser.tabs.onActivated.addListener(check);
		browser.tabs.onUpdated.addListener(onUpdated);
		return () => {
			browser.tabs.onActivated.removeListener(check);
			browser.tabs.onUpdated.removeListener(onUpdated);
		};
	}, []);
	return tab;
}

function Progress({ step, onStop }: { step: ReadStep | 'thinking'; onStop: () => void }) {
	const label = step === 'thinking' ? 'Analysing with AI' : step.label;
	const share = step === 'thinking' ? 0.92 : (step.done + 0.5) / (step.total + 1);
	return (
		<div role="status" className="grid gap-2 rounded-xl border border-line bg-surface p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium">{label}…</p>
				<Button variant="quiet" icon={<Square size={14} />} onClick={onStop}>
					Stop
				</Button>
			</div>
			<span className="block h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden="true">
				<span
					className="block h-full rounded-full bg-accent transition-[width] duration-500"
					style={{ width: `${share * 100}%` }}
				/>
			</span>
			<p className="text-xs text-muted">LinkedIn pages open in this tab one at a time, then it comes back here.</p>
		</div>
	);
}

function HistoryList({ onOpen, onBack }: { onOpen: (slug: string) => void; onBack: () => void }) {
	const [entries, setEntries] = useState<IndexEntry[] | null>(null);
	const [query, setQuery] = useState('');
	useEffect(() => {
		void store.index.get().then(setEntries);
		return store.index.subscribe(setEntries);
	}, []);
	if (!entries) return null;
	const q = query.trim().toLowerCase();
	const shown = q ? entries.filter((e) => `${e.name} ${e.headline} ${e.setName}`.toLowerCase().includes(q)) : entries;

	return (
		<div className="grid gap-3">
			<div className="flex items-center gap-2">
				<h2 className="flex-1 text-base font-semibold">History</h2>
				<Button variant="quiet" onClick={onBack}>
					Done
				</Button>
			</div>
			{entries.length === 0 ? (
				<EmptyState title="Nothing analysed yet" body="Profiles you analyse are kept here, on all your devices." />
			) : (
				<>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by name, headline or set"
						aria-label="Search history"
						className="h-9 rounded-full border border-line bg-surface px-3.5 text-base outline-none focus:border-accent"
					/>
					<ul className="rounded-xl border border-line bg-surface">
						{shown.map((e) => (
							<li key={e.slug} className="flex items-center gap-1 border-t border-line first:border-t-0">
								<button
									type="button"
									onClick={() => onOpen(e.slug)}
									className="flex min-w-0 flex-1 items-center gap-2.5 p-2.5 text-left hover:bg-soft"
								>
									{e.photo ? (
										<img src={e.photo} alt="" className="size-9 shrink-0 rounded-full bg-soft object-cover" />
									) : (
										<span className="grid size-9 shrink-0 place-items-center rounded-full bg-soft font-semibold text-muted">
											{e.name.slice(0, 1)}
										</span>
									)}
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">{e.name}</span>
										<span className="block truncate text-xs text-muted">
											{e.setName} · {timeAgo(e.analyzedAt)}
										</span>
									</span>
									<span className="rounded-full bg-soft px-2 py-0.5 text-sm font-semibold tabular-nums">{e.score}</span>
								</button>
								<IconButton label={`Delete ${e.name}`} onClick={() => void store.remove(e.slug)}>
									<Trash2 size={16} />
								</IconButton>
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}

export default function ProfileLensPanel() {
	const { settings } = useSettings();
	const ai = useModels('profile-lens');
	const tab = useCurrentTab();
	const [view, setView] = useState<View>('analyze');
	const [sets, setSets] = useState<QuestionSet[] | null>(null);
	const [activeId, setActiveId] = useState<string>('');
	const [record, setRecord] = useState<SavedAnalysis | null>(null);
	const [busy, setBusy] = useState<ReadStep | 'thinking' | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [question, setQuestion] = useState('');
	const [answering, setAnswering] = useState(false);
	const abort = useRef<AbortController | null>(null);

	useEffect(() => {
		void Promise.all([store.sets.get(), store.activeSet.get()]).then(([s, id]) => {
			setSets(s);
			setActiveId(id && s.some((x) => x.id === id) ? id : s[0]!.id);
		});
	}, []);

	// Show the saved analysis for whoever is open in the tab, if there is one.
	const tabSlug = tab?.slug ?? null;
	useEffect(() => {
		if (!tabSlug || busy) return;
		void store.load(tabSlug).then((saved) => saved && setRecord(saved));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabSlug]);

	if (!sets || !ai.keys) return null;
	const set = sets.find((s) => s.id === activeId) ?? sets[0]!;

	if (!ai.choice) {
		return (
			<EmptyState
				title="Connect an AI provider"
				body="Profile lens uses the same Claude subscription or provider API keys as the agent."
				action={
					<Button
						variant="primary"
						icon={<KeyRound size={16} />}
						onClick={() => void browser.tabs.create({ url: dashboardUrl('ai') })}
					>
						Connect a provider
					</Button>
				}
			/>
		);
	}

	function saveSets(next: QuestionSet[], id: string) {
		setSets(next);
		setActiveId(id);
		void store.sets.set(next);
		void store.activeSet.set(id);
	}

	async function analyze() {
		if (!tab || busy) return;
		setError(null);
		abort.current = new AbortController();
		const signal = abort.current.signal;
		try {
			const driver = browserTabs(browser.tabs as never, browser.scripting as never);
			const profile = await readProfile(tab.id, driver, {
				posts: featureOn(settings, 'profile-lens', 'posts'),
				onStep: setBusy,
				signal
			});
			setBusy('thinking');
			const analysis = await analyzeProfile({ model: ai.model(), profile, set, signal });
			const next = newRecord(profile, set, analysis);
			setRecord(next);
			await store.save(next);
		} catch (e) {
			if (signal.aborted) setError('Stopped.');
			else if (e instanceof ProfileError) setError(e.message);
			else setError(`The analysis didn’t finish: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setBusy(null);
		}
	}

	async function ask(e?: FormEvent, text = question) {
		e?.preventDefault();
		const q = text.trim();
		if (!q || !record || answering) return;
		setQuestion('');
		setAnswering(true);
		const chat: ChatMessage[] = [...record.chat, { role: 'user', text: q }];
		setRecord({ ...record, chat });
		abort.current = new AbortController();
		try {
			const result = askAboutProfile({ model: ai.model(), ...record, chat, signal: abort.current.signal });
			let reply = '';
			for await (const delta of result.textStream) {
				reply += delta;
				setRecord((r) => r && { ...r, chat: [...chat, { role: 'assistant', text: reply }] });
			}
			await store.saveChat(record.profile.slug, [...chat, { role: 'assistant', text: reply }]);
		} catch (err) {
			const message = abort.current.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : String(err);
			setRecord((r) => r && { ...r, chat: [...chat, { role: 'assistant', text: `(${message})` }] });
		} finally {
			setAnswering(false);
		}
	}

	if (view === 'sets') {
		return <SetEditor sets={sets} activeId={set.id} onChange={saveSets} onDone={() => setView('analyze')} />;
	}
	if (view === 'history') {
		return (
			<HistoryList
				onBack={() => setView('analyze')}
				onOpen={(slug) =>
					void store.load(slug).then((saved) => {
						if (saved) setRecord(saved);
						setView('analyze');
					})
				}
			/>
		);
	}

	const onProfile = !!tab?.slug;
	const showing = record && (!onProfile || record.profile.slug === tab?.slug) ? record : null;

	return (
		<div className="grid gap-3">
			<div className="flex items-center gap-1">
				<div className="min-w-0 flex-1">
					<Select
						label="Question set"
						value={set.id}
						onChange={(id) => saveSets(sets, id)}
						options={sets.map((s) => ({ value: s.id, label: s.name }))}
					/>
				</div>
				<IconButton label="Edit question sets" onClick={() => setView('sets')}>
					<ListChecks size={18} />
				</IconButton>
				<IconButton label="History" onClick={() => setView('history')}>
					<History size={18} />
				</IconButton>
			</div>

			<ModelPicker
				models={ai.models}
				choice={ai.choice}
				onChoose={ai.choose}
				onRefresh={ai.refresh}
				refreshing={ai.refreshing}
				note={ai.note}
			/>

			{busy ? (
				<Progress step={busy} onStop={() => abort.current?.abort()} />
			) : (
				<div className="grid gap-1.5">
					<Button
						variant="primary"
						icon={showing ? <RotateCcw size={16} /> : <ScanSearch size={16} />}
						disabled={!onProfile}
						onClick={() => void analyze()}
					>
						{showing ? 'Analyze again' : 'Analyze this profile'}
					</Button>
					<p className="text-center text-xs text-muted">
						{onProfile ? `linkedin.com/in/${tab!.slug}` : PROBLEMS['not-profile']}
					</p>
				</div>
			)}

			{error && (
				<p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
					{error}
				</p>
			)}

			{showing && !busy && (
				<>
					<Results profile={showing.profile} set={showing.set} analysis={showing.analysis} />
					<p className="text-center text-xs text-muted">
						Analysed {timeAgo(showing.analyzedAt)} with “{showing.set.name}”
					</p>

					<section aria-label="Ask about this person" className="grid gap-2">
						{showing.chat.map((m, i) => (
							<p
								key={i}
								className={`rounded-xl px-3 py-2 text-base whitespace-pre-wrap ${
									m.role === 'user' ? 'ml-8 bg-accent-soft' : 'mr-4 border border-line bg-surface'
								}`}
							>
								{m.text}
							</p>
						))}
						{showing.chat.length === 0 && (
							<div className="flex flex-wrap gap-1.5">
								{SUGGESTIONS.map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => void ask(undefined, s)}
										className="rounded-full border border-line bg-surface px-2.5 py-1 text-sm hover:bg-soft"
									>
										{s}
									</button>
								))}
							</div>
						)}
						<form onSubmit={(e) => void ask(e)} className="flex items-center gap-1.5">
							<input
								value={question}
								onChange={(e) => setQuestion(e.target.value)}
								placeholder={`Ask about ${showing.profile.name.split(' ')[0]}…`}
								aria-label="Ask about this person"
								className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-base outline-none focus:border-accent"
							/>
							{answering ? (
								<IconButton label="Stop" onClick={() => abort.current?.abort()}>
									<Square size={16} />
								</IconButton>
							) : (
								<IconButton label="Send" type="submit" disabled={!question.trim()}>
									<Send size={16} />
								</IconButton>
							)}
						</form>
					</section>
				</>
			)}
		</div>
	);
}
