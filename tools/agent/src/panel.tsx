// The browser agent in the side panel: ask in plain words, watch each step, approve every action.
import { ModelPicker, createModel, providerName, useModels, type ModelChoice, type Models } from '@toolbelt/ai';
import {
	AppFailure,
	appError,
	describeError,
	featureOn,
	toolValue,
	type ApiKeys,
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
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
	AlignLeft,
	ArrowUp,
	Ban,
	Check,
	ChevronRight,
	CircleSlash,
	Contact,
	Copy,
	Globe,
	KeyRound,
	Languages,
	Lightbulb,
	ListChecks,
	Loader2,
	Lock,
	MoreHorizontal,
	RotateCcw,
	ShieldAlert,
	Sparkles,
	Square,
	SquarePen,
	TextQuote,
	TriangleAlert,
	X
} from 'lucide-react';
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
	type FormEvent,
	type KeyboardEvent,
	type ReactNode
} from 'react';
import { browser } from 'wxt/browser';
import { loadChat, saveChat, type Entry } from './chat-store.ts';
import { agentDraft, isFresh, type AgentDraft } from './handoff.ts';
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

type StepEntry = Extract<Entry, { kind: 'step' }>;

const STATUS: Record<StepStatus, { icon: typeof Check; className: string; label: string }> = {
	running: { icon: Loader2, className: 'animate-spin text-muted', label: 'Running' },
	done: { icon: Check, className: 'text-ok', label: 'Done' },
	failed: { icon: X, className: 'text-danger', label: 'Failed' },
	declined: { icon: CircleSlash, className: 'text-faint', label: 'Declined' },
	refused: { icon: Ban, className: 'text-warn', label: 'Refused by Toolbelt' }
};

/** One-click prompts for an empty chat. With a selection attached they work on the selection instead. */
export const QUICK_ACTIONS = [
	{
		label: 'Summarise this page',
		onSelection: 'Summarise selection',
		icon: AlignLeft,
		page: 'Summarise this page.',
		selection: 'Summarise the selected text.'
	},
	{
		label: 'Key points',
		icon: ListChecks,
		page: 'List the key points of this page.',
		selection: 'List the key points of the selected text.'
	},
	{
		label: 'Explain simply',
		icon: Lightbulb,
		page: 'Explain what this page says in simple words.',
		selection: 'Explain the selected text in simple words.'
	},
	{
		label: 'Translate to English',
		icon: Languages,
		page: 'Translate the main content of this page into English.',
		selection: 'Translate the selected text into English.'
	},
	{
		label: 'Find contact info',
		icon: Contact,
		page: 'Find the contact details on this site: email, phone, address or a contact form.',
		selection: 'Find the contact details in the selected text.'
	}
] as const;

/** More consecutive steps than this fold into an "N steps" row (the latest two stay visible). */
const FOLD_AFTER = 5;
/** How often the panel looks for a selection on the page while it is open. */
const SELECTION_POLL_MS = 1500;

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const NEW_CHAT_HINT = isMac ? '⇧⌘O' : 'Ctrl Shift O';

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return '';
	}
};

/** 950 → "950", 1234 → "1.2k", 25_400 → "25k", 1_250_000 → "1.3M". */
export function compactCount(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

const copyFailed = (retry: () => void) =>
	showError(
		appError(
			'unknown',
			{},
			{
				title: 'Couldn’t copy',
				message: 'The browser blocked the clipboard. Try again, or select the text and copy it by hand.'
			}
		),
		{ onAction: (kind) => kind === 'retry' && retry() }
	);

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

/** Copy, retry and the token count under an answer. Retry is only offered on the latest turn. */
function AnswerActions({
	entry,
	canRetry,
	models,
	current,
	onRetry
}: {
	entry: Extract<Entry, { kind: 'assistant' }>;
	canRetry: boolean;
	models: Models['models'];
	current: ModelChoice;
	onRetry: (choice?: ModelChoice) => void;
}) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(entry.text);
		} catch {
			copyFailed(() => void copy());
			return;
		}
		setCopied(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 1200);
	}

	const others = models
		.filter((m) => m.tools !== false && !(m.provider === current.provider && m.id === current.model))
		.slice(0, 8);
	const usage = entry.usage;
	return (
		<div className="-ml-1 flex h-6 min-w-0 items-center gap-0.5">
			<IconButton size="xs" label={copied ? 'Copied' : 'Copy answer'} onClick={() => void copy()}>
				{copied ? <Check className="text-ok" aria-hidden="true" /> : <Copy aria-hidden="true" />}
			</IconButton>
			{canRetry && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton size="xs" label="More answer actions">
							<MoreHorizontal aria-hidden="true" />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="max-w-72">
						<DropdownMenuItem onSelect={() => void copy()}>
							<Copy aria-hidden="true" /> Copy answer
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onRetry()}>
							<RotateCcw aria-hidden="true" /> Retry
						</DropdownMenuItem>
						{others.length > 0 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>Retry with another model</DropdownMenuLabel>
								{others.map((m) => (
									<DropdownMenuItem
										key={`${m.provider}:${m.id}`}
										onSelect={() => onRetry({ provider: m.provider, model: m.id })}
									>
										<Sparkles aria-hidden="true" />
										<span className="min-w-0 flex-1 truncate">{m.name}</span>
										<DropdownMenuShortcut>{providerName(m.provider)}</DropdownMenuShortcut>
									</DropdownMenuItem>
								))}
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{usage && (
				<Tooltip side="top" label={`${usage.input.toLocaleString()} tokens in · ${usage.output.toLocaleString()} out`}>
					<span
						tabIndex={0}
						className="tb-num ml-auto rounded-xs px-1 text-xs text-faint outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
					>
						{compactCount(usage.input + usage.output)} tokens
					</span>
				</Tooltip>
			)}
		</div>
	);
}

/** "Use selection (123 chars)": attaches what is selected on the page to the next question. */
function SelectionChip({
	attached,
	selection,
	onAttach,
	onDetach
}: {
	attached: string | null;
	selection: string;
	onAttach: () => void;
	onDetach: () => void;
}) {
	if (attached)
		return (
			<div className="flex h-7 min-w-0 items-center gap-1.5 border-b border-line px-2 text-sm">
				<TextQuote className="size-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
				<span className="shrink-0 text-ink">Selection</span>
				<span className="tb-num shrink-0 text-faint">{attached.length.toLocaleString()} chars</span>
				<span className="min-w-0 flex-1 truncate text-faint" title={attached.slice(0, 400)}>
					“{attached.replace(/\s+/g, ' ').slice(0, 120)}”
				</span>
				<IconButton size="xs" label="Remove the selection" onClick={onDetach} className="-mr-1">
					<X aria-hidden="true" />
				</IconButton>
			</div>
		);
	if (!selection) return null;
	return (
		<div className="flex min-w-0 px-1.5 pt-1.5">
			<button
				type="button"
				onClick={onAttach}
				className="inline-flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-sm border border-line bg-soft px-1.5 text-sm text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				<TextQuote className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="truncate">
					Use selection <span className="tb-num text-faint">({selection.length.toLocaleString()} chars)</span>
				</span>
			</button>
		</div>
	);
}

export default function AgentPanel() {
	// Keys, live model lists and this tool's model choice, shared with every AI tool.
	const ai = useModels('agent');
	if (!ai.keys) return null;
	if (!ai.choice) {
		return (
			<EmptyState
				title="Connect an AI provider"
				body="Add an API key for Anthropic, OpenAI, Groq, Grok or Gemini in AI providers."
				action={
					<Button variant="primary" icon={<KeyRound />} onClick={() => void openDashboard('ai')}>
						Connect a provider
					</Button>
				}
			/>
		);
	}
	return <AgentChat ai={ai as Models & { keys: ApiKeys; choice: ModelChoice }} />;
}

function AgentChat({ ai }: { ai: Models & { keys: ApiKeys; choice: ModelChoice } }) {
	const { settings } = useSettings();
	const { choice } = ai;
	const [entries, setEntries] = useState<Entry[]>([]);
	const [task, setTask] = useState('');
	const [running, setRunning] = useState(false);
	const [step, setStep] = useState(0);
	const [pending, setPending] = useState<(ApprovalRequest & { id: number }) | null>(null);
	const [memoryLocked, setMemoryLocked] = useState(false);
	/** What is selected on the page right now, and what the user attached to the next question. */
	const [selection, setSelection] = useState('');
	const [attached, setAttached] = useState<string | null>(null);
	/** The tab whose conversation is on screen; null until it has loaded. */
	const [chatTab, setChatTab] = useState<number | null>(null);
	/** A hand-over that arrived before this tab's conversation was on screen. */
	const pendingDraft = useRef<AgentDraft | null>(null);
	const chatReady = useRef(false);
	const current = useCurrentTab();
	const history = useRef<ModelMessage[]>([]);
	const answer = useRef<((a: ApprovalAnswer) => void) | null>(null);
	const abort = useRef<AbortController | null>(null);
	const lastTask = useRef<{ text: string; context?: string } | null>(null);
	const nextId = useRef(0);
	const saveWarned = useRef(false);
	const root = useRef<HTMLDivElement>(null);
	const input = useRef<HTMLTextAreaElement>(null);
	const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId.current++}`;
	// Follows new messages while you are at the bottom; leaves you alone if you scrolled up to read.
	const pinToBottom = useStickToBottom([entries, pending, running]);
	const tabId = current.tab?.id ?? null;
	const shown = () => !root.current?.closest('[hidden]');

	// Each tab has its own conversation. Switching tabs (between runs) shows that tab's; a run stays on its tab.
	const switchChat = useEffectEvent((id: number) => {
		loadChat(id)
			.catch((error: unknown) => {
				showError(error);
				return null;
			})
			.then((saved) => {
				// One callback, so the screen never shows one tab's chat under another tab's id (and saves it there).
				const first = !chatReady.current;
				const earlier = saved?.entries ?? [];
				// On the first load, a question asked before the saved chat arrived stays, after it.
				history.current = first ? [...(saved?.history ?? []), ...history.current] : (saved?.history ?? []);
				if (!first) lastTask.current = null;
				setEntries((list) => (first ? [...earlier, ...list] : earlier));
				setChatTab(id);
				chatReady.current = true;
				// Only now, so a handed-over question is not replaced by the saved chat.
				const d = pendingDraft.current;
				pendingDraft.current = null;
				if (d) applyDraft(d);
			});
	});
	useEffect(() => {
		if (tabId !== null && !running && tabId !== chatTab) switchChat(tabId);
	}, [tabId, running, chatTab]);

	// Saved after every finished run (and every change between runs); never mid-run.
	useEffect(() => {
		if (chatTab === null || running) return;
		saveChat(chatTab, entries, history.current).catch((error: unknown) => {
			if (saveWarned.current) return;
			saveWarned.current = true;
			showError(error);
		});
	}, [entries, running, chatTab]);

	// Prompts handed over by the side panel's search or the right-click menu.
	const applyDraft = useEffectEvent((d: AgentDraft) => {
		if (d.context) setAttached(d.context);
		if (d.send && d.text.trim() && !running) void run(d.text.trim(), { context: d.context });
		else {
			setTask(d.text);
			input.current?.focus();
		}
	});
	const takeDraft = useEffectEvent((d: AgentDraft | null) => {
		if (!isFresh(d)) return;
		agentDraft.set(null).catch((error: unknown) => void showError(error));
		if (chatReady.current) applyDraft(d);
		else pendingDraft.current = d;
	});
	useEffect(() => {
		agentDraft.get().then(
			(d) => takeDraft(d),
			(error: unknown) => void showError(error)
		);
		return agentDraft.subscribe((d) => takeDraft(d));
	}, []);

	// The selection on the page, looked up while the panel is open. It is only an offer, so a page that does not
	// answer just shows no chip.
	const tabUrl = current.tab?.url;
	const windowId = current.tab?.windowId;
	useEffect(() => {
		if (tabId === null || windowId === undefined || current.access !== 'ok' || running) return;
		const api = pageApi(tabId, windowId, { screenshots: false });
		let alive = true;
		const read = () => {
			if (document.hidden || root.current?.closest('[hidden]')) return;
			Promise.resolve()
				.then(() => api.selection())
				.then(
					(text) => alive && setSelection(typeof text === 'string' ? text : ''),
					() => alive && setSelection('')
				);
		};
		const first = setTimeout(read, 0);
		const timer = setInterval(read, SELECTION_POLL_MS);
		window.addEventListener('focus', read);
		return () => {
			alive = false;
			clearTimeout(first);
			clearInterval(timer);
			setSelection('');
			window.removeEventListener('focus', read);
		};
	}, [tabId, windowId, tabUrl, current.access, running]);

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
				if (last?.kind === 'assistant' && last.text.trim() === e.answer.trim())
					return e.usage ? [...list.slice(0, -1), { ...last, usage: e.usage }] : list;
				if (!e.answer.trim()) return list;
				return [...list, { id: newId('answer'), kind: 'assistant', text: e.answer, usage: e.usage }];
			}
			return [...list, { id: newId('notice'), kind: 'notice', text: e.reason }];
		});
	}

	function onErrorAction(kind: AppErrorAction) {
		const again = () =>
			lastTask.current && void run(lastTask.current.text, { retry: true, context: lastTask.current.context });
		if (kind === 'open-ai-settings') void openDashboard('ai');
		else if (kind === 'unlock') void openDashboard('account');
		else if (kind === 'open-data-settings') void openDashboard('data');
		else if (kind === 'retry') again();
		else if (kind === 'grant-access') {
			// Must be called straight from the click: the browser only shows the prompt for a user gesture.
			requestHostAccess(current.tab?.url ?? '')
				.then((granted) => {
					if (granted) again();
				})
				.catch((error: unknown) => void showError(error));
		} else if (kind === 'reload-tab' && current.tab) {
			browser.tabs.reload(current.tab.id).catch((error: unknown) => void showError(error));
		}
	}

	/** `retry`: answer the last error again; `again`: the user turn is already on screen (retry from the menu). */
	async function run(
		text: string,
		opts: { retry?: boolean; again?: boolean; context?: string; with?: ModelChoice } = {}
	) {
		if (running) return;
		lastTask.current = { text, context: opts.context };
		const runInfo = opts.with
			? ai.models.find((m) => m.provider === opts.with!.provider && m.id === opts.with!.model)
			: ai.info;
		const runContext = opts.with
			? { provider: providerName(opts.with.provider), model: runInfo?.name ?? opts.with.model }
			: ai.errorContext;
		const historyAt = history.current.length;
		setEntries((list) => {
			// A retry replaces the error it answers instead of piling up notices.
			const cleaned = opts.retry && list.at(-1)?.kind === 'error' ? list.slice(0, -1) : list;
			return opts.retry || opts.again
				? cleaned
				: [...cleaned, { id: newId('user'), kind: 'user', text, context: opts.context, historyAt }];
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
				model = opts.with ? createModel(opts.with, ai.keys) : ai.model();
			} catch {
				throw new AppFailure(appError('no_provider'));
			}
			history.current = await runAgent({
				model,
				task: text,
				context: opts.context,
				history: history.current,
				provider: (opts.with ?? choice).provider,
				errorContext: runContext,
				vision: runInfo?.vision,
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
			const error = describeError(err, runContext);
			if (error.code === 'aborted' || controller.signal.aborted) onEvent({ type: 'stopped', reason: 'Stopped.' });
			else pushError(error);
		} finally {
			setRunning(false);
			setPending(null);
			abort.current = null;
		}
	}

	/** Runs the latest question again, from the same point in the conversation; `other` switches model first. */
	function retry(other?: ModelChoice) {
		const at = entries.findLastIndex((e) => e.kind === 'user');
		const user = entries[at];
		if (running || !user || user.kind !== 'user') return;
		if (other) ai.choose(other);
		history.current = history.current.slice(0, user.historyAt);
		setEntries(entries.slice(0, at + 1));
		void run(user.text, { again: true, context: user.context, with: other });
	}

	function send(e?: FormEvent) {
		e?.preventDefault();
		const text = task.trim();
		if (!text || running) return;
		setTask('');
		const context = attached ?? undefined;
		setAttached(null);
		void run(text, { context });
	}

	function quick(action: (typeof QUICK_ACTIONS)[number]) {
		if (running) return;
		const context = attached ?? undefined;
		setAttached(null);
		void run(context ? action.selection : action.page, { context });
	}

	function stop() {
		answer.current?.('stop');
		abort.current?.abort();
	}

	function newChat() {
		if (running) return;
		history.current = [];
		lastTask.current = null;
		setEntries([]);
		setAttached(null);
		input.current?.focus();
	}

	// Ctrl/Cmd+Shift+O starts a new chat while the agent is on screen.
	const onKey = useEffectEvent((e: globalThis.KeyboardEvent) => {
		if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'o' || !shown()) return;
		e.preventDefault();
		newChat();
	});
	useEffect(() => {
		const listener = (e: globalThis.KeyboardEvent) => onKey(e);
		window.addEventListener('keydown', listener);
		return () => window.removeEventListener('keydown', listener);
	}, []);

	// The answer that ends each turn gets copy / retry; only the latest turn can be retried.
	const turnEnds = new Set<string>();
	let lastAnswer: string | null = null;
	for (const entry of entries) {
		if (entry.kind === 'user') {
			if (lastAnswer) turnEnds.add(lastAnswer);
			lastAnswer = null;
		} else if (entry.kind === 'assistant' && entry.text.trim()) lastAnswer = entry.id;
	}
	if (lastAnswer && !running) turnEnds.add(lastAnswer);
	const latestAnswer = running ? null : lastAnswer;

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
					className="grid max-w-[85%] gap-1 justify-self-end rounded-lg rounded-br-xs bg-soft px-2.5 py-1.5 text-base whitespace-pre-wrap text-ink wrap-anywhere"
				>
					{entry.context && (
						<span className="line-clamp-2 border-l-2 border-line-strong pl-1.5 text-sm whitespace-normal text-muted">
							{entry.context}
						</span>
					)}
					{entry.text}
				</li>
			);
		else if (entry.kind === 'assistant') {
			if (entry.text.trim())
				rows.push(
					<li key={entry.id} className="grid min-w-0 gap-0.5 text-base wrap-anywhere text-ink">
						<Markdown text={entry.text} />
						{turnEnds.has(entry.id) && (
							<AnswerActions
								entry={entry}
								canRetry={entry.id === latestAnswer}
								models={ai.models}
								current={choice}
								onRetry={retry}
							/>
						)}
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
		<div ref={root} className="flex min-w-0 flex-1 flex-col gap-2">
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
						hint={NEW_CHAT_HINT}
						size="xs"
						className="ml-auto"
						onClick={newChat}
						disabled={running}
						aria-keyshortcuts={isMac ? 'Meta+Shift+O' : 'Control+Shift+O'}
					>
						<SquarePen />
					</IconButton>
				</div>
			)}

			{entries.length === 0 && (
				<div className="grid gap-2 pt-2">
					<p className="text-base text-muted">
						Ask about this page or give it a task. It reads the page and asks before every click or keystroke.
					</p>
					<div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick actions">
						{QUICK_ACTIONS.map((action) => {
							const Icon = action.icon;
							const label = attached && 'onSelection' in action ? action.onSelection : action.label;
							return (
								<button
									key={action.label}
									type="button"
									disabled={running}
									onClick={() => quick(action)}
									className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-sm text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
								>
									<Icon className="size-3.5 shrink-0" aria-hidden="true" />
									{label}
								</button>
							);
						})}
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
					<SelectionChip
						attached={attached}
						selection={running ? '' : selection}
						onAttach={() => {
							setAttached(selection);
							input.current?.focus();
						}}
						onDetach={() => {
							setAttached(null);
							input.current?.focus();
						}}
					/>
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
						placeholder={attached ? 'Ask about the selection' : 'Ask about this page or give it a task'}
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
