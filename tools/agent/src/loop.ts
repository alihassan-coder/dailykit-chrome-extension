// The agent loop: one model turn at a time. Reads run straight away; every action goes through the policy,
// then the user's approval, then runs on the page. Runs in the side panel, so closing it stops the run.
//
// Errors: a provider failure (bad key, rate limit, model gone, prompt too long) throws an AppFailure with a
// typed AppError, never a raw message. A tool that fails (tab closed, page script gone) becomes an error tool
// result the model can recover from, so one bad step doesn't end the run.
import { AppFailure, appError, memoryContext, toAppError, type ChatTurn, type ErrorContext } from '@toolbelt/core';
import { streamText, type LanguageModel, type ModelMessage, type SystemModelMessage, type ToolResultPart } from 'ai';
import type { ActionResult, PageAction, TargetInfo } from './actuation.ts';
import { decide, pageAccess, siteOf, type PageAccess, type Proposal } from './policy.ts';
import { READ_TOOLS, newNonce, systemPrompt, toolsFor, untrusted, type AgentToolName } from './tools.ts';

export type Target = TargetInfo;

export type Shot = { ok: true; image: string } | { ok: false; reason: string };

/** What the loop can do with the tab. The side panel implements it with messages; tests use a fake. */
export interface PageApi {
	url(): Promise<string>;
	title(): Promise<string>;
	read(opts: { all?: boolean; ref?: string }): Promise<string>;
	find(query: string): Promise<string>;
	text(): Promise<string>;
	screenshot(): Promise<Shot>;
	target(ref: string): Promise<Target | null>;
	/** The focused element: what a key press acts on. */
	focused(): Promise<Target | null>;
	/** Acts, waits for the page to settle, and says what changed. */
	act(action: PageAction): Promise<ActionResult>;
	navigate(url: string): Promise<ActionResult>;
	wait(opts: { ms?: number; selector?: string; text?: string }): Promise<ActionResult>;
	/** Outlines the element being approved. False when it could not be drawn. */
	highlight(ref: string | null): Promise<boolean>;
}

export type ApprovalAnswer = 'once' | 'site' | 'decline' | 'stop';

export interface ApprovalRequest {
	/** "Click button “Sign in”", "Type into “Search”: weather Lahore" */
	summary: string;
	site: string;
	/** The page the action happens on. */
	url: string;
	/** What the element shows on screen, when the action has one. */
	targetText?: string;
	warnings: string[];
	/** Always-ask actions cannot be covered by "always allow on this site". */
	alwaysAsk: boolean;
	/** The element is outlined on the page (false when that failed, or there is no element). */
	highlighted: boolean;
}

export type StepStatus = 'running' | 'done' | 'failed' | 'declined' | 'refused';

export type AgentEvent =
	/** The model's text for one turn so far; the same id updates the same bubble. */
	| { type: 'text'; id: string; text: string }
	/** One tool call. Sent as 'running' first, then again with the final status, under the same id. */
	| { type: 'step'; id: string; tool: string; summary: string; status: StepStatus; detail?: string; ms?: number }
	/** A new model turn started. */
	| { type: 'progress'; step: number }
	| { type: 'finished'; answer: string }
	| { type: 'stopped'; reason: string };

export interface RunOptions {
	model: LanguageModel;
	task: string;
	page: PageApi;
	approve: (request: ApprovalRequest) => Promise<ApprovalAnswer>;
	siteAllowed: (site: string) => Promise<boolean>;
	allowSite: (site: string) => Promise<void>;
	onEvent: (event: AgentEvent) => void;
	/** Earlier turns of this chat, so follow-up questions keep context. */
	history?: ModelMessage[];
	signal?: AbortSignal;
	maxSteps?: number;
	/** Long-term memory: notes relevant to this task, added to the system prompt as untrusted data. */
	recall?: (task: string) => Promise<string[]>;
	/** Called once a run finishes with an answer: the task and the answer, never page content. */
	remember?: (turns: ChatTurn[]) => void;
	/** The provider id ('anthropic' turns on prompt caching). */
	provider?: string;
	/** Wording for provider errors (provider name, model, setup token). */
	errorContext?: ErrorContext;
	/** False when the model cannot see images: the screenshot tool is not offered. */
	vision?: boolean;
	/** Today, for the system prompt (tests pass a fixed date). */
	now?: Date;
}

const NOT_EXECUTED = 'Not executed: an earlier action in this turn did not go ahead.';
export const OMITTED_READ = '[earlier page read omitted]';
const OMITTED_SHOT = '[earlier screenshot omitted]';
const SHOT_INTRO = 'Screenshot of the page (untrusted content):';
/** Tools whose results are big page observations; only the latest of each kind stays in the conversation. */
const PAGE_READS = new Set(['read_page', 'get_page_text']);

function summarize(name: AgentToolName, input: Record<string, unknown>, target: Target | null): string {
	const what = target ? `${target.role} “${target.name || 'unnamed'}”` : String(input.ref ?? 'the page');
	switch (name) {
		case 'left_click':
			return `Click ${what}`;
		case 'type':
			return `Type into ${what}: ${target?.sensitive ? '••••' : String(input.text)}${input.submit ? ', then submit' : ''}`;
		case 'form_input':
			return `Set ${what} to ${String(input.value)}`;
		case 'key':
			return `Press ${String(input.keys)}${target ? ` on ${what}` : ''}`;
		case 'scroll':
			return `Scroll ${String(input.direction)}${input.ref ? ` inside ${what}` : ''}`;
		case 'navigate':
			return `Go to ${String(input.url)}`;
		default:
			return name;
	}
}

const READ_SUMMARY: Partial<Record<AgentToolName, (input: Record<string, unknown>) => string>> = {
	read_page: (i) => (i.ref ? `Read part of the page` : i.all ? 'Read the whole page' : 'Read the page'),
	find: (i) => `Find “${String(i.query)}”`,
	get_page_text: () => 'Read the page text',
	screenshot: () => 'Take a screenshot',
	wait: (i) =>
		i.selector
			? `Wait for ${String(i.selector)}`
			: i.text
				? `Wait for “${String(i.text)}”`
				: `Wait ${Number(i.ms ?? 1000)} ms`
};

function toAction(name: AgentToolName, input: Record<string, unknown>): PageAction | null {
	const ref = input.ref as string;
	if (name === 'left_click') return { kind: 'click', ref };
	if (name === 'type') return { kind: 'type', ref, text: String(input.text), submit: Boolean(input.submit) };
	if (name === 'form_input') return { kind: 'form_input', ref, value: input.value as string | boolean };
	if (name === 'key') return { kind: 'key', keys: String(input.keys) };
	if (name === 'scroll')
		return { kind: 'scroll', direction: input.direction as 'up' | 'down', ref: input.ref as string | undefined };
	return null;
}

const KIND: Partial<Record<AgentToolName, Proposal['kind']>> = {
	left_click: 'click',
	type: 'type',
	form_input: 'form_input',
	key: 'key',
	scroll: 'scroll',
	navigate: 'navigate'
};

const ACCESS_MESSAGE: Record<Exclude<PageAccess, 'ok'>, string> = {
	'no-access': 'Toolbelt has no access to this site. Ask the user to allow the agent on this site, then try again.',
	restricted:
		'This is a browser page, the Web Store or a built-in viewer, which no extension can read or change. Ask the user to open a normal web page.',
	blocked: 'This site is blocked for the agent. Ask the user to do this themselves.'
};

const originOf = (url: string) => {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
};

const isAbort = (e: unknown) =>
	typeof e === 'object' && e !== null && /abort/i.test(String((e as { name?: unknown }).name ?? ''));

/**
 * Keeps only the latest page read and the latest screenshot in the conversation; older ones are replaced by a
 * short marker. Page reads are the bulk of every request, and stale ones only confuse the model.
 */
export function pruneObservations(messages: ModelMessage[]): void {
	let keptRead = false;
	let keptShot = false;
	for (let m = messages.length - 1; m >= 0; m--) {
		const msg = messages[m]!;
		if (msg.role === 'tool') {
			msg.content = msg.content.map((part) => {
				if (part.type !== 'tool-result' || !PAGE_READS.has(part.toolName) || part.output.type !== 'text') return part;
				if (part.output.value === OMITTED_READ) return part;
				if (!keptRead) {
					keptRead = true;
					return part;
				}
				return { ...part, output: { type: 'text', value: OMITTED_READ } };
			});
		} else if (msg.role === 'user' && Array.isArray(msg.content) && msg.content.some((p) => p.type === 'image')) {
			if (!keptShot) keptShot = true;
			else messages[m] = { role: 'user', content: [{ type: 'text', text: OMITTED_SHOT }] };
		}
	}
}

export async function runAgent(opts: RunOptions): Promise<ModelMessage[]> {
	const { page, onEvent } = opts;
	const ctx = opts.errorContext ?? {};
	const nonce = newNonce();
	const wrap = (text: string) => untrusted(text, nonce);
	const cache = opts.provider === 'anthropic' ? { anthropic: { cacheControl: { type: 'ephemeral' } } } : undefined;
	const tools = toolsFor(opts.provider);
	const activeTools = (Object.keys(tools) as AgentToolName[]).filter(
		(t) => t !== 'screenshot' || opts.vision !== false
	);

	/** The tab as the model should know it each step: the address, and the page's title as untrusted data. */
	async function tabState(): Promise<string> {
		const [url, title] = await Promise.all([page.url(), page.title().catch(() => '')]);
		return `Current tab: ${url || '(address hidden: no access to this site)'}${title ? `\nTitle: ${wrap(title)}` : ''}`;
	}

	let firstState: string;
	try {
		firstState = await tabState();
	} catch (error) {
		throw new AppFailure(toAppError(error, ctx));
	}
	const messages: ModelMessage[] = [
		...(opts.history ?? []),
		{
			role: 'user',
			content: [
				{ type: 'text', text: opts.task },
				{ type: 'text', text: firstState }
			]
		}
	];
	// Memory is a help, never a blocker: if recall fails the run goes ahead without it.
	const notes = opts.recall ? await opts.recall(opts.task).catch(() => []) : [];
	const system: SystemModelMessage = {
		role: 'system',
		content: systemPrompt({ nonce, today: opts.now ?? new Date() }) + memoryContext(notes),
		...(cache ? { providerOptions: cache } : {})
	};
	const finish = (answer: string) => {
		onEvent({ type: 'finished', answer });
		if (answer.trim())
			opts.remember?.([
				{ role: 'user', content: opts.task },
				{ role: 'assistant', content: answer }
			]);
	};
	const runOrigins = new Set<string>();
	const learnOrigin = (url: string) => {
		const origin = originOf(url);
		if (origin && /^https?:/.test(origin)) runOrigins.add(origin);
	};
	learnOrigin(await page.url().catch(() => ''));

	const maxSteps = opts.maxSteps ?? 25;
	for (let step = 0; step < maxSteps; step++) {
		onEvent({ type: 'progress', step: step + 1 });
		pruneObservations(messages);
		const result = streamText({
			model: opts.model,
			system,
			messages,
			tools,
			activeTools,
			toolChoice: 'auto',
			abortSignal: opts.signal
		});
		const textId = `text-${step}-${nonce}`;
		let text = '';
		let failure: unknown = null;
		try {
			// fullStream, not textStream: textStream silently drops error parts, so a rejected key or a rate
			// limit would look like an empty answer.
			for await (const part of result.fullStream) {
				if (part.type === 'text-delta') {
					text += part.text;
					onEvent({ type: 'text', id: textId, text });
				} else if (part.type === 'error') {
					failure = part.error;
					break;
				} else if (part.type === 'abort') {
					failure = Object.assign(new Error('aborted'), { name: 'AbortError' });
					break;
				}
			}
		} catch (error) {
			failure = error;
		}
		if (failure !== null) {
			if (opts.signal?.aborted || isAbort(failure)) throw new AppFailure(appError('aborted', ctx));
			throw new AppFailure(toAppError(failure, ctx));
		}
		let calls: Awaited<typeof result.toolCalls>;
		try {
			calls = await result.toolCalls;
			messages.push(...(await result.response).messages);
		} catch (error) {
			if (opts.signal?.aborted) throw new AppFailure(appError('aborted', ctx));
			throw new AppFailure(toAppError(error, ctx));
		}

		if (!calls.length) {
			if (!text.trim())
				throw new AppFailure(
					appError('bad_output', ctx, {
						message: 'The model ended without an answer. Try again, or pick another model.'
					})
				);
			finish(text);
			return messages;
		}

		const results: ToolResultPart[] = [];
		const screenshots: string[] = [];
		let halted = false;
		let finished: string | null = null;
		const reply = (call: (typeof calls)[number], value: string, error = false) =>
			results.push({
				type: 'tool-result',
				toolCallId: call.toolCallId,
				toolName: call.toolName,
				output: error ? { type: 'error-text', value } : { type: 'text', value }
			});
		const stepEvent = (
			id: string,
			tool: string,
			summary: string,
			status: StepStatus,
			extra: { detail?: string; ms?: number } = {}
		) => onEvent({ type: 'step', id, tool, summary, status, ...extra });

		for (const call of calls) {
			// Calls the SDK could not parse already have an error result in the response messages.
			if ((call as { invalid?: boolean }).invalid) continue;
			const name = call.toolName as AgentToolName;
			const input = (call.input ?? {}) as Record<string, unknown>;
			if (halted) {
				reply(call, NOT_EXECUTED, true);
				continue;
			}
			if (name === 'finish') {
				finished = String(input.answer ?? text);
				reply(call, 'Done.');
				continue;
			}

			const started = Date.now();
			const id = `${call.toolCallId}-${nonce}`;
			let url: string;
			try {
				url = await page.url();
			} catch (error) {
				// The tab is gone: nothing more can happen in this run.
				throw new AppFailure(toAppError(error, ctx));
			}
			const site = siteOf(url);
			const access = pageAccess(url);

			if (READ_TOOLS.has(name)) {
				const summary = READ_SUMMARY[name]?.(input) ?? name;
				if (access !== 'ok') {
					reply(call, ACCESS_MESSAGE[access], true);
					stepEvent(id, name, summary, 'refused', { detail: site || undefined });
					continue;
				}
				stepEvent(id, name, summary, 'running', { detail: site });
				try {
					let ok = true;
					if (name === 'read_page')
						reply(call, wrap(await page.read({ all: Boolean(input.all), ref: input.ref as string | undefined })));
					if (name === 'find') reply(call, wrap(await page.find(String(input.query))));
					if (name === 'get_page_text') reply(call, wrap(await page.text()));
					if (name === 'wait') {
						const r = await page.wait({
							ms: typeof input.ms === 'number' ? input.ms : undefined,
							selector: typeof input.selector === 'string' ? input.selector : undefined,
							text: typeof input.text === 'string' ? input.text : undefined
						});
						ok = r.ok;
						reply(call, r.message, !r.ok);
					}
					if (name === 'screenshot') {
						const shot = await page.screenshot();
						ok = shot.ok;
						if (shot.ok) screenshots.push(shot.image);
						reply(call, shot.ok ? 'Screenshot attached in the next message.' : shot.reason, !shot.ok);
					}
					stepEvent(id, name, summary, ok ? 'done' : 'failed', { detail: site, ms: Date.now() - started });
				} catch (error) {
					const e = toAppError(error, ctx);
					reply(call, `Failed: ${e.title}. ${e.message}`, true);
					stepEvent(id, name, summary, 'failed', { detail: e.title, ms: Date.now() - started });
				}
				continue;
			}

			// An action: access and policy first, then the user, then the page.
			let target: Target | null;
			let summary = summarize(name, input, null);
			try {
				target =
					typeof input.ref === 'string' ? await page.target(input.ref) : name === 'key' ? await page.focused() : null;
				summary = summarize(name, input, target);
			} catch (error) {
				const e = toAppError(error, ctx);
				reply(call, `Failed: ${e.title}. ${e.message}`, true);
				stepEvent(id, name, summary, 'failed', { detail: e.title });
				halted = true;
				continue;
			}
			if (access !== 'ok' && access !== 'blocked') {
				reply(call, ACCESS_MESSAGE[access], true);
				stepEvent(id, name, summary, 'refused', { detail: site || undefined });
				halted = true;
				continue;
			}
			const submits =
				(name === 'type' && Boolean(input.submit)) ||
				(name === 'key' &&
					/(^|\s)(enter|return)(\s|$)/i.test(String(input.keys)) &&
					Boolean(target?.inForm) &&
					/textbox|searchbox/.test(target?.role ?? ''));
			const proposal: Proposal = {
				kind: KIND[name]!,
				url,
				destination: name === 'navigate' ? String(input.url) : undefined,
				target: target ?? undefined,
				text: typeof input.text === 'string' ? input.text : undefined,
				keys: name === 'key' ? String(input.keys) : undefined,
				submit: submits
			};
			const decision = decide(proposal, { siteAllowed: await opts.siteAllowed(site), runOrigins });

			if (decision.verdict === 'refuse') {
				reply(call, `Refused by Toolbelt: ${decision.reason}`, true);
				stepEvent(id, name, summary, 'refused', { detail: decision.reason });
				halted = true;
				continue;
			}
			if (decision.verdict === 'ask') {
				const ref = typeof input.ref === 'string' ? input.ref : target?.ref;
				const highlighted = ref ? await page.highlight(ref) : false;
				const answer = await opts.approve({
					summary,
					site,
					url,
					targetText: target ? target.text || target.name || undefined : undefined,
					warnings: decision.warnings,
					alwaysAsk: decision.alwaysAsk,
					highlighted
				});
				if (ref) await page.highlight(null);
				if (answer === 'stop') {
					onEvent({ type: 'stopped', reason: 'You stopped the agent.' });
					return messages;
				}
				if (answer === 'decline') {
					reply(call, 'The user declined this action. Ask what they would like instead, or finish.', true);
					stepEvent(id, name, summary, 'declined');
					halted = true;
					continue;
				}
				if (answer === 'site') await opts.allowSite(site);
			}

			stepEvent(id, name, summary, 'running', { detail: site });
			const acted = Date.now();
			let outcome: ActionResult;
			try {
				outcome = name === 'navigate' ? await page.navigate(String(input.url)) : await page.act(toAction(name, input)!);
			} catch (error) {
				const e = toAppError(error, ctx);
				outcome = { ok: false, message: `Failed: ${e.title}. ${e.message}` };
			}
			// Sites reached by the user's approved clicks and navigations are part of this run: going back to them
			// is not a "new site".
			if (outcome.ok) learnOrigin(await page.url().catch(() => ''));
			reply(call, outcome.ok ? wrap(outcome.message) : outcome.message, !outcome.ok);
			stepEvent(id, name, summary, outcome.ok ? 'done' : 'failed', {
				detail: outcome.ok ? site : outcome.message.slice(0, 120),
				ms: Date.now() - acted
			});
			if (!outcome.ok) halted = true;
		}

		if (results.length) {
			// Each step ends with where the tab is now, so the model never acts on an old idea of the page.
			const last = results.at(-1)!;
			const state = await tabState().catch(() => 'Current tab: unknown (the tab may have been closed).');
			if (last.output.type === 'text' || last.output.type === 'error-text')
				last.output = { ...last.output, value: `${last.output.value}\n\n${state}` };
			messages.push({ role: 'tool', content: results });
		}
		if (screenshots.length) {
			messages.push({
				role: 'user',
				content: [
					{ type: 'text', text: SHOT_INTRO },
					...screenshots.map((image) => ({ type: 'image' as const, image }))
				]
			});
		}
		if (finished !== null) {
			finish(finished);
			return messages;
		}
	}

	onEvent({ type: 'stopped', reason: `Stopped after ${maxSteps} steps. Ask again to continue.` });
	return messages;
}
