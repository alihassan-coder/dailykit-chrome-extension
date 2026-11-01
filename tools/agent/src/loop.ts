// The agent loop: one model turn at a time. Reads run straight away; every action goes through the policy,
// then the user's approval, then runs on the page. Runs in the side panel, so closing it stops the run.
import { memoryContext, type ChatTurn } from '@toolbelt/core';
import { streamText, type LanguageModel, type ModelMessage, type ToolResultPart } from 'ai';
import type { ActionResult, PageAction } from './actuation.ts';
import { decide, isBlocked, siteOf, type Proposal } from './policy.ts';
import { READ_TOOLS, SYSTEM_PROMPT, agentTools, untrusted, type AgentToolName } from './tools.ts';

export interface Target {
	role: string;
	name: string;
	sensitive: boolean;
}

/** What the loop can do with the tab. The side panel implements it with messages; tests use a fake. */
export interface PageApi {
	url(): Promise<string>;
	read(opts: { all?: boolean; ref?: string }): Promise<string>;
	find(query: string): Promise<string>;
	text(): Promise<string>;
	screenshot(): Promise<string | null>;
	target(ref: string): Promise<Target | null>;
	act(action: PageAction): Promise<ActionResult>;
	navigate(url: string): Promise<ActionResult>;
	highlight(ref: string | null): Promise<void>;
}

export type ApprovalAnswer = 'once' | 'site' | 'decline' | 'stop';

export interface ApprovalRequest {
	/** "Click button “Sign in”", "Type into “Search”: weather Lahore" */
	summary: string;
	site: string;
	warnings: string[];
	/** Always-ask actions cannot be covered by "always allow on this site". */
	alwaysAsk: boolean;
}

export type AgentEvent =
	| { type: 'text'; text: string }
	| { type: 'step'; tool: string; summary: string; status: 'done' | 'failed' | 'declined' | 'refused' }
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
}

const NOT_EXECUTED = 'Not executed: an earlier action in this turn did not go ahead.';

function summarize(name: AgentToolName, input: Record<string, unknown>, target: Target | null): string {
	const what = target ? `${target.role} “${target.name || 'unnamed'}”` : String(input.ref ?? 'the page');
	switch (name) {
		case 'left_click':
			return `Click ${what}`;
		case 'type':
			return `Type into ${what}: ${target?.sensitive ? '••••' : String(input.text)}${input.submit ? ', then press Enter' : ''}`;
		case 'form_input':
			return `Set ${what} to ${String(input.value)}`;
		case 'key':
			return `Press ${String(input.keys)}`;
		case 'scroll':
			return `Scroll ${String(input.direction)}${input.ref ? ` inside ${what}` : ''}`;
		case 'navigate':
			return `Go to ${String(input.url)}`;
		default:
			return name;
	}
}

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

export async function runAgent(opts: RunOptions): Promise<ModelMessage[]> {
	const { page, onEvent } = opts;
	const messages: ModelMessage[] = [...(opts.history ?? []), { role: 'user', content: opts.task }];
	// Memory is a help, never a blocker: if recall fails the run goes ahead without it.
	const notes = opts.recall ? await opts.recall(opts.task).catch(() => []) : [];
	const system = SYSTEM_PROMPT + memoryContext(notes);
	const finish = (answer: string) => {
		onEvent({ type: 'finished', answer });
		if (answer.trim())
			opts.remember?.([
				{ role: 'user', content: opts.task },
				{ role: 'assistant', content: answer }
			]);
	};
	const runOrigins = new Set<string>();
	try {
		runOrigins.add(new URL(await page.url()).origin);
	} catch {
		/* a browser page; the policy refuses everything there anyway */
	}

	for (let step = 0; step < (opts.maxSteps ?? 25); step++) {
		const result = streamText({
			model: opts.model,
			system,
			messages,
			tools: agentTools,
			toolChoice: 'auto',
			abortSignal: opts.signal
		});
		let text = '';
		for await (const delta of result.textStream) {
			text += delta;
			onEvent({ type: 'text', text });
		}
		const calls = await result.toolCalls;
		messages.push(...(await result.response).messages);

		if (!calls.length) {
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

		for (const call of calls) {
			const name = call.toolName as AgentToolName;
			const input = (call.input ?? {}) as Record<string, unknown>;
			if (halted) {
				reply(call, NOT_EXECUTED, true);
				continue;
			}
			const url = await page.url();

			if (name === 'finish') {
				finished = String(input.answer ?? text);
				reply(call, 'Done.');
				continue;
			}

			if (READ_TOOLS.has(name)) {
				if (isBlocked(url)) {
					reply(call, 'This site is blocked for the agent. Ask the user to do this themselves.', true);
					continue;
				}
				if (name === 'read_page')
					reply(call, untrusted(await page.read({ all: Boolean(input.all), ref: input.ref as string | undefined })));
				if (name === 'find') reply(call, untrusted(await page.find(String(input.query))));
				if (name === 'get_page_text') reply(call, untrusted(await page.text()));
				if (name === 'screenshot') {
					const shot = await page.screenshot();
					if (shot) screenshots.push(shot);
					reply(
						call,
						shot ? 'Screenshot attached in the next message.' : 'Could not take a screenshot of this page.',
						!shot
					);
				}
				onEvent({ type: 'step', tool: name, summary: name.replace('_', ' '), status: 'done' });
				continue;
			}

			// An action: policy first, then the user, then the page.
			const target = typeof input.ref === 'string' ? await page.target(input.ref) : null;
			const summary = summarize(name, input, target);
			const proposal: Proposal = {
				kind: KIND[name]!,
				url,
				destination: name === 'navigate' ? String(input.url) : undefined,
				target: target ?? undefined,
				text: typeof input.text === 'string' ? input.text : undefined
			};
			const site = siteOf(url);
			const decision = decide(proposal, { siteAllowed: await opts.siteAllowed(site), runOrigins });

			if (decision.verdict === 'refuse') {
				reply(call, `Refused by Toolbelt: ${decision.reason}`, true);
				onEvent({ type: 'step', tool: name, summary: `${summary}. ${decision.reason}`, status: 'refused' });
				halted = true;
				continue;
			}
			if (decision.verdict === 'ask') {
				if (typeof input.ref === 'string') await page.highlight(input.ref);
				const answer = await opts.approve({
					summary,
					site,
					warnings: decision.warnings,
					alwaysAsk: decision.alwaysAsk
				});
				await page.highlight(null);
				if (answer === 'stop') {
					onEvent({ type: 'stopped', reason: 'You stopped the agent.' });
					return messages;
				}
				if (answer === 'decline') {
					reply(call, 'The user declined this action. Ask what they would like instead, or finish.', true);
					onEvent({ type: 'step', tool: name, summary, status: 'declined' });
					halted = true;
					continue;
				}
				if (answer === 'site') await opts.allowSite(site);
			}

			const outcome =
				name === 'navigate' ? await page.navigate(String(input.url)) : await page.act(toAction(name, input)!);
			if (name === 'navigate' && outcome.ok) runOrigins.add(new URL(String(input.url)).origin);
			reply(call, outcome.message, !outcome.ok);
			onEvent({ type: 'step', tool: name, summary, status: outcome.ok ? 'done' : 'failed' });
			if (!outcome.ok) halted = true;
		}

		messages.push({ role: 'tool', content: results });
		if (screenshots.length) {
			messages.push({
				role: 'user',
				content: [
					{ type: 'text', text: 'Screenshot of the page (untrusted content):' },
					...screenshots.map((image) => ({ type: 'image' as const, image }))
				]
			});
		}
		if (finished !== null) {
			finish(finished);
			return messages;
		}
	}

	onEvent({ type: 'stopped', reason: `Stopped after ${opts.maxSteps ?? 25} steps. Ask again to continue.` });
	return messages;
}
