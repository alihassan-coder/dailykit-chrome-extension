// The browser agent in the side panel: ask in plain words, watch each step, approve every action.
import { ModelPicker, useModels } from '@toolbelt/ai';
import { featureOn, toolValue, type ChatTurn, type MemoryRequest, type MemoryResponse } from '@toolbelt/core';
import { Button, EmptyState, IconButton, Notice, inputClass, localArea, useSettings, useStickToBottom } from '@toolbelt/ui';
import type { ModelMessage } from 'ai';
import { Ban, Check, CircleSlash, Globe, KeyRound, RotateCcw, Send, ShieldAlert, Square, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { runAgent, type AgentEvent, type ApprovalAnswer, type ApprovalRequest } from './loop.ts';
import { activeTab, pageApi } from './page-api.ts';

const asSites = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const allowedSites = toolValue(localArea, 'agent', 'allowed-sites', asSites);
// Tool packages cannot see the app's generated page types; the dashboard is options.html in the Toolbelt app.
const dashboardUrl = (section: string) =>
	(browser.runtime as unknown as { getURL(path: string): string }).getURL(`/options.html#${section}`);

// Long-term memory lives in the background (encrypted in the user's database). The agent asks it for notes
// before a run and hands it the finished chat afterwards; the background decides whether memory is on.
const askMemory = (req: MemoryRequest) => browser.runtime.sendMessage(req) as Promise<MemoryResponse | undefined>;
/** Recall must not hold up the run: past this, the agent starts without notes. */
export const RECALL_WAIT_MS = 4000;

export async function recallNotes(query: string): Promise<string[]> {
	const notes = askMemory({ type: 'memory:recall', query, limit: 8 }).then((r) =>
		r?.ok ? (r.items ?? []).map((m) => m.text) : []
	);
	const late = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), RECALL_WAIT_MS));
	return Promise.race([notes.catch(() => []), late]);
}

export function rememberChat(messages: ChatTurn[]) {
	void askMemory({ type: 'memory:add', messages }).catch(() => {});
}

type Entry =
	| { kind: 'user'; text: string }
	| { kind: 'assistant'; text: string }
	| { kind: 'step'; summary: string; status: 'done' | 'failed' | 'declined' | 'refused' }
	| { kind: 'notice'; text: string }
	| { kind: 'error'; text: string };

const STATUS = {
	done: { icon: Check, className: 'text-ok' },
	failed: { icon: X, className: 'text-danger' },
	declined: { icon: CircleSlash, className: 'text-muted' },
	refused: { icon: Ban, className: 'text-warn' }
} as const;

function ApprovalCard({ request, onAnswer }: { request: ApprovalRequest; onAnswer: (a: ApprovalAnswer) => void }) {
	return (
		<div
			role="alertdialog"
			aria-label="Approve this action"
			tabIndex={-1}
			ref={(el) => el?.focus()}
			className="grid min-w-0 gap-2 rounded-xl border border-accent bg-surface p-3 shadow-float outline-none"
		>
			<p className="text-xs text-muted">The agent wants to</p>
			<p className="font-semibold wrap-anywhere">{request.summary}</p>
			<p className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
				<Globe size={14} className="shrink-0" /> <span className="min-w-0 truncate">on {request.site}</span>
			</p>
			{request.warnings.map((w) => (
				<p key={w} className="flex items-start gap-1.5 text-sm text-warn">
					<ShieldAlert size={16} className="mt-0.5 shrink-0" /> {w}
				</p>
			))}
			<div className="flex flex-wrap gap-2">
				<Button variant="primary" onClick={() => onAnswer('once')}>
					Allow once
				</Button>
				{!request.alwaysAsk && (
					<Button onClick={() => onAnswer('site')} title={`Always allow on ${request.site}`}>
						Always allow on this site
					</Button>
				)}
				<Button variant="quiet" onClick={() => onAnswer('decline')}>
					Decline
				</Button>
				<Button variant="quiet" onClick={() => onAnswer('stop')}>
					Stop
				</Button>
			</div>
		</div>
	);
}

export default function AgentPanel() {
	const { settings } = useSettings();
	// Keys, live model lists and this tool's model choice, shared with every AI tool.
	const ai = useModels('agent');
	const { keys, choice } = ai;
	const [entries, setEntries] = useState<Entry[]>([]);
	const [task, setTask] = useState('');
	const [running, setRunning] = useState(false);
	const [pending, setPending] = useState<ApprovalRequest | null>(null);
	const history = useRef<ModelMessage[]>([]);
	const answer = useRef<((a: ApprovalAnswer) => void) | null>(null);
	const abort = useRef<AbortController | null>(null);
	// Follows new messages while you are at the bottom; leaves you alone if you scrolled up to read.
	const pinToBottom = useStickToBottom([entries, pending]);

	if (!keys) return null;
	if (!choice) {
		return (
			<EmptyState
				title="Connect an AI provider"
				body="Connect your Claude subscription or an API key for Anthropic, OpenAI, Grok or Gemini in AI providers."
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

	function onEvent(e: AgentEvent) {
		setEntries((list) => {
			if (e.type === 'text') {
				const last = list.at(-1);
				return last?.kind === 'assistant'
					? [...list.slice(0, -1), { kind: 'assistant', text: e.text }]
					: [...list, { kind: 'assistant', text: e.text }];
			}
			if (e.type === 'step') return [...list, { kind: 'step', summary: e.summary, status: e.status }];
			if (e.type === 'finished') {
				const last = list.at(-1);
				return last?.kind === 'assistant' && last.text === e.answer
					? list
					: [...list, { kind: 'assistant', text: e.answer }];
			}
			return [...list, { kind: 'notice', text: e.reason }];
		});
	}

	async function send(e: FormEvent) {
		e.preventDefault();
		if (running) return;
		const text = task.trim();
		if (!text || running || !choice || !keys) return;
		const tab = await activeTab();
		if (!tab) return;
		setTask('');
		setEntries((l) => [...l, { kind: 'user', text }]);
		pinToBottom();
		setRunning(true);
		abort.current = new AbortController();
		try {
			history.current = await runAgent({
				model: ai.model(),
				task: text,
				history: history.current,
				page: pageApi(tab.id, tab.windowId, { screenshots: featureOn(settings, 'agent', 'screenshots') }),
				signal: abort.current.signal,
				onEvent,
				recall: async (query) => {
					const notes = await recallNotes(query);
					if (notes.length)
						setEntries((l) => [
							...l,
							{ kind: 'notice', text: `Using ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} from memory.` }
						]);
					return notes;
				},
				remember: rememberChat,
				siteAllowed: async (site) => (await allowedSites.get()).includes(site),
				allowSite: async (site) => void (await allowedSites.update((s) => [...new Set([...s, site])])),
				approve: (request) =>
					new Promise((resolve) => {
						setPending(request);
						answer.current = (a) => {
							setPending(null);
							answer.current = null;
							resolve(a);
						};
					})
			});
		} catch (err) {
			if (abort.current?.signal.aborted) onEvent({ type: 'stopped', reason: 'Stopped.' });
			else setEntries((l) => [...l, { kind: 'error', text: friendlyError(err) }]);
		} finally {
			setRunning(false);
			setPending(null);
		}
	}

	function stop() {
		answer.current?.('stop');
		abort.current?.abort();
	}

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-3">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<ModelPicker
					models={ai.models}
					choice={choice}
					onChoose={ai.choose}
					onRefresh={ai.refresh}
					refreshing={ai.refreshing}
					note={ai.note}
				/>
				<IconButton
					label="New chat"
					onClick={() => {
						history.current = [];
						setEntries([]);
					}}
					disabled={running}
				>
					<RotateCcw size={16} />
				</IconButton>
			</div>

			{entries.length === 0 && (
				<p className="text-base text-muted">
					Ask about this page or give it a task, like “summarise this article” or “fill in this form with my details”.
					You approve every click and every bit of typing.
				</p>
			)}

			<p role="status" className="sr-only">
				{pending ? 'Waiting for your approval' : running ? '' : entries.length ? 'Answer ready' : ''}
			</p>
			<ol className="grid min-w-0 flex-1 content-start gap-2.5" aria-busy={running}>
				{entries.map((entry, i) => {
					if (entry.kind === 'user')
						return (
							<li
								key={i}
								className="max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-base whitespace-pre-wrap text-ink wrap-anywhere"
							>
								{entry.text}
							</li>
						);
					if (entry.kind === 'assistant')
						return (
							<li key={i} className="text-base leading-relaxed whitespace-pre-wrap wrap-anywhere">
								{entry.text}
							</li>
						);
					if (entry.kind === 'error')
						return (
							<li key={i}>
								<Notice tone="danger">{entry.text}</Notice>
							</li>
						);
					if (entry.kind === 'notice')
						return (
							<li key={i} className="text-sm text-muted">
								{entry.text}
							</li>
						);
					const { icon: Icon, className } = STATUS[entry.status];
					return (
						<li key={i} className="flex items-start gap-2 text-sm text-muted">
							<Icon size={16} className={`mt-0.5 shrink-0 ${className}`} />
							<span className="min-w-0 wrap-anywhere">{entry.summary}</span>
						</li>
					);
				})}
			</ol>

			{pending && <ApprovalCard request={pending} onAnswer={(a) => answer.current?.(a)} />}

			<form
				onSubmit={send}
				className="sticky bottom-0 -mx-3 grid gap-2 bg-bg/95 px-3 pt-2 pb-3 shadow-[0_-12px_12px_-4px_var(--tb-bg)]"
			>
				<textarea
					value={task}
					onChange={(e) => setTask(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							e.currentTarget.form?.requestSubmit();
						}
					}}
					rows={2}
					placeholder="Ask about this page or give it a task"
					aria-label="Ask the agent"
					className={`${inputClass} max-h-40 min-h-16 w-full resize-none overflow-y-auto rounded-2xl px-3.5 py-2.5 [field-sizing:content]`}
				/>
				<div className="flex justify-end">
					{running ? (
						<Button icon={<Square size={14} />} onClick={stop}>
							Stop
						</Button>
					) : (
						<Button type="submit" variant="primary" icon={<Send size={14} />} disabled={!task.trim()}>
							Send
						</Button>
					)}
				</div>
			</form>
		</div>
	);
}

/** Turns a provider error into a sentence that says what to do next. */
function friendlyError(err: unknown): string {
	const message = err instanceof Error ? err.message : String(err);
	if (/401|unauthori[sz]ed|invalid.*(api key|x-api-key)|authentication/i.test(message))
		return 'That API key was rejected. Check it in Dashboard → AI providers.';
	if (/429|rate limit|quota/i.test(message)) return 'The provider is rate-limiting this key. Wait a moment and try again.';
	if (/fetch failed|network|ENOTFOUND|Failed to fetch/i.test(message))
		return 'The AI provider could not be reached. Check your connection and try again.';
	if (/No output generated/i.test(message))
		return 'The model returned nothing. The key may be invalid or the model unavailable; check AI providers.';
	return `The model could not answer: ${message}`;
}
