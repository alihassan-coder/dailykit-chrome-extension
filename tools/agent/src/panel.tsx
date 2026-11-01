// The browser agent in the side panel: ask in plain words, watch each step, approve every action.
import { featureOn, resolveApiKeys, toolValue, type ApiKeys } from '@toolbelt/core';
import { Button, EmptyState, IconButton, localArea, useSettings } from '@toolbelt/ui';
import type { ModelMessage } from 'ai';
import { Ban, Check, CircleSlash, Globe, KeyRound, RotateCcw, Send, ShieldAlert, Square, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { runAgent, type AgentEvent, type ApprovalAnswer, type ApprovalRequest } from './loop.ts';
import { activeTab, pageApi } from './page-api.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { available, refresh, resolveCache, type ModelCache } from './models.ts';
import { createModel, defaultChoice, type ModelChoice } from './providers.ts';

const keysStore = toolValue(localArea, 'ai', 'keys', resolveApiKeys);
const asSites = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const allowedSites = toolValue(localArea, 'agent', 'allowed-sites', asSites);
// Tool packages cannot see the app's generated page types; the dashboard is options.html in the Toolbelt app.
const dashboardUrl = (section: string) =>
	(browser.runtime as unknown as { getURL(path: string): string }).getURL(`/options.html#${section}`);

const modelCache = toolValue(localArea, 'agent', 'models', resolveCache);

const choiceStore = toolValue(localArea, 'agent', 'model', (v) =>
	typeof v === 'object' && v !== null && 'provider' in v && 'model' in v ? (v as ModelChoice) : null
);

type Entry =
	| { kind: 'user'; text: string }
	| { kind: 'assistant'; text: string }
	| { kind: 'step'; summary: string; status: 'done' | 'failed' | 'declined' | 'refused' }
	| { kind: 'notice'; text: string };

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
			className="grid gap-3 rounded-lg border-2 border-accent bg-surface p-4"
		>
			<p className="text-xs text-muted">The agent wants to</p>
			<p className="font-semibold">{request.summary}</p>
			<p className="flex items-center gap-1.5 text-sm text-muted">
				<Globe size={14} /> on {request.site}
			</p>
			{request.warnings.map((w) => (
				<p key={w} className="flex items-start gap-1.5 text-sm text-warn">
					<ShieldAlert size={16} className="mt-0.5 shrink-0" /> {w}
				</p>
			))}
			<div className="flex flex-wrap gap-2">
				<Button variant="primary" onClick={() => onAnswer('once')} autoFocus>
					Allow once
				</Button>
				{!request.alwaysAsk && <Button onClick={() => onAnswer('site')}>Always allow on {request.site}</Button>}
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
	const [keys, setKeys] = useState<ApiKeys | null>(null);
	const [choice, setChoice] = useState<ModelChoice | null>(null);
	const [cache, setCache] = useState<ModelCache>({});
	const [refreshing, setRefreshing] = useState(false);
	const [modelNote, setModelNote] = useState<string | null>(null);
	const [entries, setEntries] = useState<Entry[]>([]);
	const [task, setTask] = useState('');
	const [running, setRunning] = useState(false);
	const [pending, setPending] = useState<ApprovalRequest | null>(null);
	const history = useRef<ModelMessage[]>([]);
	const answer = useRef<((a: ApprovalAnswer) => void) | null>(null);
	const abort = useRef<AbortController | null>(null);
	const end = useRef<HTMLDivElement>(null);

	async function loadModels(k: ApiKeys, force = false) {
		setRefreshing(true);
		const { cache: next, errors } = await refresh(await modelCache.get(), k, { force });
		await modelCache.set(next);
		setCache(next);
		setRefreshing(false);
		const failed = Object.entries(errors).map(([p, e]) => `${p}: ${e}`);
		setModelNote(failed.length ? `Couldn't refresh ${failed.join('; ')}` : null);
		return next;
	}

	useEffect(() => {
		async function start(k: ApiKeys) {
			setKeys(k);
			const saved = await choiceStore.get();
			const cached = await modelCache.get();
			setCache(cached);
			const pick = (c: ModelCache) =>
				setChoice((current) => {
					const keep = current ?? saved;
					return keep && k[keep.provider] ? keep : defaultChoice(available(c, k));
				});
			pick(cached);
			pick(await loadModels(k));
		}
		void keysStore.get().then(start);
		return keysStore.subscribe((k) => void start(k));
	}, []);

	useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [entries, pending]);

	if (!keys) return null;
	if (!choice) {
		return (
			<EmptyState
				title="Add an AI provider key"
				body="The agent uses your own key for Anthropic, OpenAI, Grok or Gemini. Keys stay in this browser and sync encrypted."
				action={
					<Button
						variant="primary"
						icon={<KeyRound size={16} />}
						onClick={() => void browser.tabs.create({ url: dashboardUrl('ai') })}
					>
						Add a key
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
		const text = task.trim();
		if (!text || running || !choice || !keys) return;
		const tab = await activeTab();
		if (!tab) return;
		setTask('');
		setEntries((l) => [...l, { kind: 'user', text }]);
		setRunning(true);
		abort.current = new AbortController();
		try {
			history.current = await runAgent({
				model: createModel(choice, keys),
				task: text,
				history: history.current,
				page: pageApi(tab.id, tab.windowId, { screenshots: featureOn(settings, 'agent', 'screenshots') }),
				signal: abort.current.signal,
				onEvent,
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
			const message = err instanceof Error ? err.message : String(err);
			onEvent({
				type: 'stopped',
				reason: abort.current?.signal.aborted ? 'Stopped.' : `The model could not be reached: ${message}`
			});
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
		<div className="grid gap-3">
			<div className="flex items-center justify-between gap-2">
				<ModelPicker
					models={available(cache, keys)}
					choice={choice}
					onChoose={(c) => {
						setChoice(c);
						void choiceStore.set(c);
					}}
					onRefresh={() => void loadModels(keys, true)}
					refreshing={refreshing}
					note={modelNote}
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
				<p className="text-sm text-muted">
					Ask about this page or give it a task, like “summarise this article” or “fill in this form with my details”.
					You approve every click and every bit of typing.
				</p>
			)}

			<ol className="grid gap-2" aria-live="polite">
				{entries.map((entry, i) => {
					if (entry.kind === 'user')
						return (
							<li key={i} className="justify-self-end rounded-lg bg-accent px-3 py-2 text-sm text-on-accent">
								{entry.text}
							</li>
						);
					if (entry.kind === 'assistant')
						return (
							<li key={i} className="font-read text-[15px] leading-relaxed whitespace-pre-wrap">
								{entry.text}
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
							<span>{entry.summary}</span>
						</li>
					);
				})}
			</ol>

			{pending && <ApprovalCard request={pending} onAnswer={(a) => answer.current?.(a)} />}
			<div ref={end} />

			<form onSubmit={send} className="sticky bottom-0 grid gap-2 bg-bg pt-2">
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
					disabled={running}
					className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
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
