// The browser agent in the side panel: ask in plain words, watch each step, approve every action.
import { ModelPicker, useModels } from '@toolbelt/ai';
import {
	AppFailure,
	appError,
	describeError,
	featureOn,
	toolValue,
	type AppError,
	type AppErrorAction,
	type ChatTurn,
	type MemoryRequest,
	type MemoryResponse,
	type MemoryStatus
} from '@toolbelt/core';
import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	EmptyState,
	ErrorNotice,
	IconButton,
	Tooltip,
	UiButton,
	cn,
	localArea,
	showError,
	useSettings,
	useStickToBottom
} from '@toolbelt/ui';
import type { ModelMessage } from 'ai';
import {
	ArrowUp,
	Ban,
	Check,
	ChevronRight,
	CircleSlash,
	Globe,
	KeyRound,
	Loader2,
	Lock,
	RotateCcw,
	ShieldAlert,
	Square,
	TriangleAlert,
	X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { runAgent, type AgentEvent, type ApprovalAnswer, type ApprovalRequest, type StepStatus } from './loop.ts';
import { Markdown } from './markdown.tsx';
import { activeTab, hasHostAccess, pageApi, requestHostAccess, type ActiveTab } from './page-api.ts';
import { pageAccess } from './policy.ts';

const asSites = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const allowedSites = toolValue(localArea, 'agent', 'allowed-sites', asSites);
// Tool packages cannot see the app's generated page types; the dashboard is options.html in the Toolbelt app.
const dashboardUrl = (section: string) =>
	(browser.runtime as unknown as { getURL(path: string): string }).getURL(`/options.html#${section}`);
const openDashboard = (section: string) =>
	browser.tabs.create({ url: dashboardUrl(section) }).catch((error: unknown) => void showError(error));

// Long-term memory lives in the background (encrypted in the user's database). The agent asks it for notes
// before a run and hands it the finished chat afterwards; the background decides whether memory is on.
const askMemory = (req: MemoryRequest) => browser.runtime.sendMessage(req) as Promise<MemoryResponse | undefined>;
/** Recall must not hold up the run: past this, the agent starts without notes. */
export const RECALL_WAIT_MS = 4000;

/** Notes for this task. `onStatus` hears memory's state (locked, no key...) so the panel can say why it is off. */
export async function recallNotes(query: string, onStatus?: (status: MemoryStatus) => void): Promise<string[]> {
	const notes = askMemory({ type: 'memory:recall', query, limit: 8 }).then((r) => {
		if (r?.status) onStatus?.(r.status);
		return r?.ok ? (r.items ?? []).map((m) => m.text) : [];
	});
	const late = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), RECALL_WAIT_MS));
	return Promise.race([notes.catch(() => []), late]);
}

export function rememberChat(messages: ChatTurn[]) {
	// Saving memory is a background nicety: if the background is unreachable the chat itself is unaffected.
	askMemory({ type: 'memory:add', messages }).catch(() => undefined);
}

type Entry =
	| { id: string; kind: 'user'; text: string }
	| { id: string; kind: 'assistant'; text: string }
	| { id: string; kind: 'step'; summary: string; status: StepStatus; detail?: string; ms?: number }
	| { id: string; kind: 'notice'; text: string }
	| { id: string; kind: 'error'; error: AppError };

type StepEntry = Extract<Entry, { kind: 'step' }>;

const STATUS: Record<StepStatus, { icon: typeof Check; className: string; label: string }> = {
	running: { icon: Loader2, className: 'animate-spin text-muted', label: 'Running' },
	done: { icon: Check, className: 'text-ok', label: 'Done' },
	failed: { icon: X, className: 'text-danger', label: 'Failed' },
	declined: { icon: CircleSlash, className: 'text-faint', label: 'Declined' },
	refused: { icon: Ban, className: 'text-warn', label: 'Refused by Toolbelt' }
};

const EXAMPLES = ['Summarise this page', 'What are the key points here?', 'Find the contact details on this site'];
/** More consecutive steps than this fold into an "N steps" row (the latest two stay visible). */
const FOLD_AFTER = 5;

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return '';
	}
};

function StepRow({ step }: { step: StepEntry }) {
	const { icon: Icon, className, label } = STATUS[step.status];
	const meta = [step.detail, step.ms !== undefined ? seconds(step.ms) : null].filter(Boolean).join(' · ');
	return (
		<li
			className="flex h-6 min-w-0 items-center gap-2 text-sm"
			title={meta ? `${step.summary} — ${meta}` : step.summary}
		>
			<Icon className={cn('size-3.5 shrink-0', className)} aria-label={label} />
			<span className={cn('min-w-0 flex-1 truncate', step.status === 'running' ? 'text-ink' : 'text-muted')}>
				{step.summary}
			</span>
			{meta && <span className="tb-num max-w-[45%] shrink-0 truncate text-xs text-faint">{meta}</span>}
		</li>
	);
}

function StepGroup({ steps }: { steps: StepEntry[] }) {
	if (steps.length <= FOLD_AFTER)
		return (
			<li>
				<ol className="grid">
					{steps.map((s) => (
						<StepRow key={s.id} step={s} />
					))}
				</ol>
			</li>
		);
	const folded = steps.slice(0, -2);
	const failed = folded.filter((s) => s.status === 'failed' || s.status === 'refused').length;
	return (
		<li>
			<Collapsible>
				<CollapsibleTrigger className="group flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm text-sm text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40">
					<ChevronRight
						className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90"
						aria-hidden="true"
					/>
					<span className="tb-num">
						{folded.length} steps{failed ? ` · ${failed} did not go ahead` : ''}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<ol className="grid">
						{folded.map((s) => (
							<StepRow key={s.id} step={s} />
						))}
					</ol>
				</CollapsibleContent>
			</Collapsible>
			<ol className="grid">
				{steps.slice(-2).map((s) => (
					<StepRow key={s.id} step={s} />
				))}
			</ol>
		</li>
	);
}

function ApprovalCard({ request, onAnswer }: { request: ApprovalRequest; onAnswer: (a: ApprovalAnswer) => void }) {
	const card = useRef<HTMLDivElement>(null);
	// Focus once, when the request appears, so Enter / Esc work straight away; never on later renders.
	useEffect(() => card.current?.focus(), []);
	function onKeyDown(e: KeyboardEvent) {
		// A focused button handles its own Enter; the card's shortcuts are for the card itself.
		if ((e.target as HTMLElement).closest('button')) return;
		if (e.key === 'Enter') onAnswer('once');
		else if (e.key === 'Escape') onAnswer('decline');
		else return;
		e.preventDefault();
	}
	const showTarget = request.targetText && !request.summary.includes(request.targetText);
	return (
		<div
			ref={card}
			role="alertdialog"
			aria-label="Approve this action"
			aria-describedby="agent-approval-summary"
			tabIndex={-1}
			onKeyDown={onKeyDown}
			className="tb-enter grid min-w-0 gap-1.5 rounded-lg border border-accent/40 bg-surface p-2.5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
		>
			<div className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
				<ShieldAlert className="size-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
				<span className="shrink-0">Allow this action?</span>
				<span className="ml-auto min-w-0 truncate" title={request.url}>
					{request.site || hostOf(request.url)}
				</span>
			</div>
			<p id="agent-approval-summary" className="font-medium wrap-anywhere text-ink">
				{request.summary}
			</p>
			{showTarget && <p className="truncate text-sm text-muted">“{request.targetText}”</p>}
			<p className="truncate text-xs text-faint" title={request.url}>
				{request.url}
			</p>
			{request.warnings.map((w) => (
				<p key={w} className="flex items-start gap-1.5 text-sm text-warn">
					<TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w}
				</p>
			))}
			{!request.highlighted && request.targetText && (
				<p className="text-xs text-faint">The element couldn’t be outlined on the page.</p>
			)}
			<div className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-1.5">
				<Button size="sm" variant="primary" onClick={() => onAnswer('once')} aria-keyshortcuts="Enter">
					Allow once
				</Button>
				{!request.alwaysAsk && (
					<Button
						size="sm"
						onClick={() => onAnswer('site')}
						title={`Always allow on ${request.site}`}
						className="min-w-0"
					>
						<span className="truncate">Allow on this site</span>
					</Button>
				)}
				<Button size="sm" variant="quiet" onClick={() => onAnswer('decline')} aria-keyshortcuts="Escape">
					Deny
				</Button>
			</div>
		</div>
	);
}

function PageChip({ tab, access }: { tab: ActiveTab | null; access: TabAccess }) {
	const host = tab ? hostOf(tab.url) : '';
	const label = !tab
		? 'No tab'
		: access === 'none'
			? 'No access'
			: access === 'restricted'
				? 'Browser page'
				: host || 'This page';
	return (
		<Tooltip side="top" label={tab?.title ? `Page: ${tab.title}` : 'The page the agent works on'}>
			<span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-sm px-1.5 text-sm text-faint">
				{access !== 'ok' ? (
					<ShieldAlert className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
				) : tab?.favIconUrl && /^(https:|data:image\/)/.test(tab.favIconUrl) ? (
					<img src={tab.favIconUrl} alt="" className="size-3.5 shrink-0 rounded-xs" />
				) : (
					<Globe className="size-3.5 shrink-0" aria-hidden="true" />
				)}
				<span className="truncate">{label}</span>
			</span>
		</Tooltip>
	);
}

type TabAccess = 'ok' | 'none' | 'restricted';

/** Keeps track of the tab the agent would work on, and whether Toolbelt may read it. */
function useCurrentTab() {
	const [tab, setTab] = useState<ActiveTab | null>(null);
	const [access, setAccess] = useState<TabAccess>('ok');
	const check = useCallback(async () => {
		const t = await activeTab();
		setTab(t);
		if (!t) return { tab: null, access: 'ok' as TabAccess };
		const kind = pageAccess(t.url);
		const a: TabAccess =
			kind === 'restricted' ? 'restricted' : kind === 'no-access' || !(await hasHostAccess(t.url)) ? 'none' : 'ok';
		setAccess(a);
		return { tab: t, access: a };
	}, []);
	useEffect(() => {
		const refresh = () => void check().catch(() => setTab(null));
		refresh();
		browser.tabs.onActivated.addListener(refresh);
		browser.tabs.onUpdated.addListener(refresh);
		return () => {
			browser.tabs.onActivated.removeListener(refresh);
			browser.tabs.onUpdated.removeListener(refresh);
		};
	}, [check]);
	return { tab, access, check };
}

export default function AgentPanel() {
	const { settings } = useSettings();
	// Keys, live model lists and this tool's model choice, shared with every AI tool.
	const ai = useModels('agent');
	const { keys, choice } = ai;
	const [entries, setEntries] = useState<Entry[]>([]);
	const [task, setTask] = useState('');
	const [running, setRunning] = useState(false);
	const [step, setStep] = useState(0);
	const [pending, setPending] = useState<(ApprovalRequest & { id: number }) | null>(null);
	const [memoryLocked, setMemoryLocked] = useState(false);
	const current = useCurrentTab();
	const history = useRef<ModelMessage[]>([]);
	const answer = useRef<((a: ApprovalAnswer) => void) | null>(null);
	const abort = useRef<AbortController | null>(null);
	const lastTask = useRef<string | null>(null);
	const nextId = useRef(0);
	const input = useRef<HTMLTextAreaElement>(null);
	const newId = (prefix: string) => `${prefix}-${nextId.current++}`;
	// Follows new messages while you are at the bottom; leaves you alone if you scrolled up to read.
	const pinToBottom = useStickToBottom([entries, pending, running]);

	if (!keys) return null;
	if (!choice) {
		return (
			<EmptyState
				title="Connect an AI provider"
				body="Connect your Claude subscription or an API key for Anthropic, OpenAI, Grok or Gemini in AI providers."
				action={
					<Button variant="primary" icon={<KeyRound />} onClick={() => void openDashboard('ai')}>
						Connect a provider
					</Button>
				}
			/>
		);
	}

	const push = (entry: Entry) => setEntries((list) => [...list, entry]);
	const pushError = (error: AppError) => push({ id: newId('error'), kind: 'error', error });

	function onEvent(e: AgentEvent) {
		if (e.type === 'progress') {
			setStep(e.step);
			return;
		}
		setEntries((list) => {
			if (e.type === 'text') {
				const at = list.findIndex((x) => x.id === e.id);
				const entry: Entry = { id: e.id, kind: 'assistant', text: e.text };
				return at >= 0 ? list.map((x, i) => (i === at ? entry : x)) : [...list, entry];
			}
			if (e.type === 'step') {
				const entry: Entry = {
					id: e.id,
					kind: 'step',
					summary: e.summary,
					status: e.status,
					detail: e.detail,
					ms: e.ms
				};
				const at = list.findIndex((x) => x.id === e.id);
				return at >= 0 ? list.map((x, i) => (i === at ? entry : x)) : [...list, entry];
			}
			if (e.type === 'finished') {
				const last = list.at(-1);
				if (!e.answer.trim() || (last?.kind === 'assistant' && last.text.trim() === e.answer.trim())) return list;
				return [...list, { id: newId('answer'), kind: 'assistant', text: e.answer }];
			}
			return [...list, { id: newId('notice'), kind: 'notice', text: e.reason }];
		});
	}

	function onErrorAction(kind: AppErrorAction) {
		if (kind === 'open-ai-settings') void openDashboard('ai');
		else if (kind === 'unlock') void openDashboard('account');
		else if (kind === 'open-data-settings') void openDashboard('data');
		else if (kind === 'retry') {
			if (lastTask.current) void run(lastTask.current, { retry: true });
		} else if (kind === 'grant-access') {
			// Must be called straight from the click: the browser only shows the prompt for a user gesture.
			requestHostAccess(current.tab?.url ?? '')
				.then((granted) => {
					if (granted && lastTask.current) void run(lastTask.current, { retry: true });
				})
				.catch((error: unknown) => void showError(error));
		} else if (kind === 'reload-tab' && current.tab) {
			browser.tabs.reload(current.tab.id).catch((error: unknown) => void showError(error));
		}
	}

	async function run(text: string, opts: { retry?: boolean } = {}) {
		if (running || !choice || !keys) return;
		lastTask.current = text;
		setEntries((list) => {
			// A retry replaces the error it answers instead of piling up notices.
			const cleaned = opts.retry && list.at(-1)?.kind === 'error' ? list.slice(0, -1) : list;
			return opts.retry ? cleaned : [...cleaned, { id: newId('user'), kind: 'user', text }];
		});
		pinToBottom();

		let tab: ActiveTab | null;
		let access: TabAccess;
		try {
			({ tab, access } = await current.check());
		} catch {
			tab = null;
			access = 'ok';
		}
		if (!tab) return pushError(appError('no_tab'));
		if (access === 'restricted') return pushError(appError('restricted_page'));
		if (access === 'none') return pushError(appError('no_host_access'));

		setRunning(true);
		setStep(0);
		const controller = new AbortController();
		abort.current = controller;
		try {
			let model;
			try {
				model = ai.model();
			} catch {
				throw new AppFailure(appError('no_provider'));
			}
			history.current = await runAgent({
				model,
				task: text,
				history: history.current,
				provider: choice.provider,
				errorContext: ai.errorContext,
				vision: ai.info?.vision,
				page: pageApi(tab.id, tab.windowId, { screenshots: featureOn(settings, 'agent', 'screenshots') }),
				signal: controller.signal,
				onEvent,
				recall: async (query) => {
					const notes = await recallNotes(query, (status) => setMemoryLocked(status.state === 'locked'));
					if (notes.length)
						push({
							id: newId('notice'),
							kind: 'notice',
							text: `Using ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} from memory.`
						});
					return notes;
				},
				remember: rememberChat,
				siteAllowed: async (site) => (await allowedSites.get()).includes(site),
				allowSite: async (site) => void (await allowedSites.update((s) => [...new Set([...s, site])])),
				approve: (request) =>
					new Promise((resolve) => {
						setPending({ ...request, id: nextId.current++ });
						answer.current = (a) => {
							setPending(null);
							answer.current = null;
							resolve(a);
						};
					})
			});
		} catch (err) {
			const error = describeError(err, ai.errorContext);
			if (error.code === 'aborted' || controller.signal.aborted) onEvent({ type: 'stopped', reason: 'Stopped.' });
			else pushError(error);
		} finally {
			setRunning(false);
			setPending(null);
			abort.current = null;
		}
	}

	function send(e?: FormEvent) {
		e?.preventDefault();
		const text = task.trim();
		if (!text || running) return;
		setTask('');
		void run(text);
	}

	function stop() {
		answer.current?.('stop');
		abort.current?.abort();
	}

	// Consecutive steps are shown as one dense group.
	const rows: ReactNode[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]!;
		if (entry.kind === 'step') {
			const steps: StepEntry[] = [];
			while (i < entries.length && entries[i]!.kind === 'step') steps.push(entries[i++] as StepEntry);
			i--;
			rows.push(<StepGroup key={steps[0]!.id} steps={steps} />);
		} else if (entry.kind === 'user')
			rows.push(
				<li
					key={entry.id}
					className="max-w-[85%] justify-self-end rounded-lg rounded-br-xs bg-soft px-2.5 py-1.5 text-base whitespace-pre-wrap text-ink wrap-anywhere"
				>
					{entry.text}
				</li>
			);
		else if (entry.kind === 'assistant') {
			if (entry.text.trim())
				rows.push(
					<li key={entry.id} className="min-w-0 text-base wrap-anywhere text-ink">
						<Markdown text={entry.text} />
					</li>
				);
		} else if (entry.kind === 'error')
			rows.push(
				<li key={entry.id}>
					<ErrorNotice error={entry.error} onAction={onErrorAction} />
				</li>
			);
		else
			rows.push(
				<li key={entry.id} className="text-sm text-faint">
					{entry.text}
				</li>
			);
	}

	const status = pending
		? 'Waiting for your approval'
		: running
			? `Working, step ${step}`
			: entries.length
				? 'Ready'
				: '';
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-2">
			{(entries.length > 0 || memoryLocked) && (
				<div className="flex h-7 min-w-0 items-center gap-2">
					{memoryLocked && (
						<Tooltip side="bottom" label="Unlock Toolbelt in the dashboard to let the agent use your memory">
							<span className="inline-flex items-center gap-1 text-xs text-faint">
								<Lock className="size-3.5" aria-hidden="true" /> Memory off · locked
							</span>
						</Tooltip>
					)}
					<IconButton
						label="New chat"
						size="xs"
						className="ml-auto"
						onClick={() => {
							history.current = [];
							lastTask.current = null;
							setEntries([]);
						}}
						disabled={running}
					>
						<RotateCcw />
					</IconButton>
				</div>
			)}

			{entries.length === 0 && (
				<div className="grid gap-2 pt-2">
					<p className="text-base text-muted">
						Ask about this page or give it a task. It reads the page and asks before every click or keystroke.
					</p>
					<div className="flex flex-wrap gap-1.5">
						{EXAMPLES.map((example) => (
							<button
								key={example}
								type="button"
								onClick={() => {
									setTask(example);
									input.current?.focus();
								}}
								className="h-7 cursor-pointer rounded-md border border-line bg-surface px-2 text-sm text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
							>
								{example}
							</button>
						))}
					</div>
				</div>
			)}

			<p role="status" className="sr-only">
				{status}
			</p>
			<ol className="grid min-w-0 flex-1 content-start gap-2" aria-busy={running}>
				{rows}
			</ol>

			{pending && <ApprovalCard key={pending.id} request={pending} onAnswer={(a) => answer.current?.(a)} />}

			<form onSubmit={send} className="sticky bottom-0 -mx-3 grid gap-1.5 bg-bg px-3 pt-1.5 pb-3">
				{running && (
					<div className="flex h-6 min-w-0 items-center gap-2 text-sm text-muted" aria-hidden="true">
						<span className="relative h-0.5 w-10 shrink-0 overflow-hidden rounded-full bg-soft">
							<span className="absolute inset-0 animate-pulse rounded-full bg-accent" />
						</span>
						<span className="tb-num truncate">
							{pending ? 'Waiting for your approval' : `Working… step ${Math.max(step, 1)}`}
						</span>
						<Button size="xs" variant="quiet" className="ml-auto" onClick={stop} icon={<Square className="size-3" />}>
							Stop
						</Button>
					</div>
				)}
				{ai.problem && !running && <ErrorNotice error={ai.problem} />}
				<div className="grid min-w-0 rounded-lg border border-line bg-surface shadow-xs transition-[border-color,box-shadow] duration-100 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
					<textarea
						ref={input}
						value={task}
						onChange={(e) => setTask(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
								e.preventDefault();
								send();
							}
						}}
						rows={1}
						placeholder="Ask about this page or give it a task"
						aria-label="Ask the agent"
						className="block max-h-32 min-h-9 w-full resize-none overflow-y-auto bg-transparent px-2.5 pt-2 pb-1 text-base text-ink outline-none [field-sizing:content] placeholder:text-faint"
					/>
					<div className="flex min-w-0 items-center gap-0.5 px-1 pb-1">
						<ModelPicker
							models={ai.models}
							choice={choice}
							onChoose={ai.choose}
							onRefresh={ai.refresh}
							refreshing={ai.refreshing}
							note={ai.note}
							toolsOnly
							warning={ai.problem?.title}
							className="min-w-0 shrink"
						/>
						<PageChip tab={current.tab} access={current.access} />
						<span className="ml-auto" />
						{running ? (
							<Tooltip side="top" label="Stop">
								<UiButton variant="secondary" size="icon-xs" aria-label="Stop" onClick={stop}>
									<Square className="size-3" />
								</UiButton>
							</Tooltip>
						) : (
							<Tooltip side="top" label="Send" hint="Enter">
								<UiButton type="submit" variant="primary" size="icon-xs" aria-label="Send" disabled={!task.trim()}>
									<ArrowUp />
								</UiButton>
							</Tooltip>
						)}
					</div>
				</div>
			</form>
		</div>
	);
}
