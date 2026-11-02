// One error model for every screen. Anything that fails (a provider call, a tab, storage, sync) is turned into
// an AppError with plain words and the one thing to do next. Raw messages never reach the screen: they can
// carry request bodies or keys, and they read like stack traces. Core has no dependencies, so provider and
// browser errors are recognised by shape and name, not by importing their classes.

export type AppErrorCode =
	| 'offline'
	| 'auth_invalid'
	| 'subscription_token'
	| 'permission_denied'
	| 'rate_limited'
	| 'quota_exhausted'
	| 'model_not_found'
	| 'context_too_long'
	| 'provider_unavailable'
	| 'bad_output'
	| 'aborted'
	| 'no_provider'
	| 'no_tab'
	| 'no_host_access'
	| 'restricted_page'
	| 'tab_gone'
	| 'linkedin_signed_out'
	| 'linkedin_missing'
	| 'linkedin_partial'
	| 'storage_full'
	| 'account_locked'
	| 'sync_failed'
	| 'unknown';

export type AppErrorAction =
	'open-ai-settings' | 'grant-access' | 'retry' | 'unlock' | 'sign-in-linkedin' | 'reload-tab' | 'open-data-settings';

export interface AppError {
	code: AppErrorCode;
	title: string;
	message: string;
	severity: 'error' | 'warn' | 'info';
	retryable: boolean;
	retryAfterMs?: number;
	action?: { label: string; kind: AppErrorAction };
}

export interface ErrorContext {
	/** "Anthropic", "OpenAI"... used in the wording. */
	provider?: string;
	model?: string;
	/** True when the Anthropic credential is a Claude subscription token, which Toolbelt does not accept. */
	setupToken?: boolean;
}

const ACTIONS = {
	settings: { label: 'Open AI settings', kind: 'open-ai-settings' },
	retry: { label: 'Try again', kind: 'retry' },
	access: { label: 'Allow on this site', kind: 'grant-access' },
	unlock: { label: 'Unlock', kind: 'unlock' },
	reload: { label: 'Reload tab', kind: 'reload-tab' },
	linkedin: { label: 'Open LinkedIn', kind: 'sign-in-linkedin' },
	data: { label: 'Open data settings', kind: 'open-data-settings' }
} as const satisfies Record<string, AppError['action']>;

/** Builds an AppError by code, with the standard wording. */
export function appError(code: AppErrorCode, ctx: ErrorContext = {}, extra: Partial<AppError> = {}): AppError {
	const who = ctx.provider ?? 'The AI provider';
	const base = ((): Omit<AppError, 'code'> => {
		switch (code) {
			case 'offline':
				return {
					title: 'You’re offline',
					message: 'Check your connection, then try again.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'subscription_token':
				return {
					title: 'Use an Anthropic API key',
					message:
						'Claude subscription tokens only work in Anthropic’s own apps (Claude, Claude Code). Add an Anthropic API key from console.anthropic.com instead.',
					severity: 'error',
					retryable: false,
					action: ACTIONS.settings
				};
			case 'auth_invalid':
				return {
					title: `${who} rejected the key`,
					message: ctx.setupToken
						? 'Claude subscription tokens only work in Anthropic’s own apps (Claude, Claude Code). Add an Anthropic API key from console.anthropic.com instead.'
						: 'Check the key and its permissions in AI settings, or paste a new one.',
					severity: 'error',
					retryable: false,
					action: ACTIONS.settings
				};
			case 'permission_denied':
				return {
					title: `${who} denied access`,
					message: ctx.setupToken
						? 'Claude subscription tokens only work in Anthropic’s own apps (Claude, Claude Code). Add an Anthropic API key from console.anthropic.com instead.'
						: 'This request is not permitted. Check your account, key permissions, and model access in the provider console.',
					severity: 'error',
					retryable: false,
					action: ACTIONS.settings
				};
			case 'rate_limited':
				return {
					title: 'Rate limit reached',
					message: `${who} is asking us to slow down. Wait a moment, then try again.`,
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'quota_exhausted':
				return {
					title: 'Out of credit or usage',
					message: `Your ${who} account has no usage left. Add credit or wait for the limit to reset.`,
					severity: 'error',
					retryable: false,
					action: ACTIONS.settings
				};
			case 'model_not_found':
				return {
					title: 'Model not available',
					message: `${ctx.model ? `“${ctx.model}”` : 'This model'} isn’t available to your account. Pick another model.`,
					severity: 'error',
					retryable: false
				};
			case 'context_too_long':
				return {
					title: 'Too much to read at once',
					message:
						'The page or conversation is longer than this model accepts. Start a new chat or pick a model with a larger context.',
					severity: 'error',
					retryable: false
				};
			case 'provider_unavailable':
				return {
					title: `${who} is having trouble`,
					message: 'The service is overloaded or down right now. Try again in a minute.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'bad_output':
				return {
					title: 'The answer came back malformed',
					message: 'The model didn’t follow the expected format. Try again, or pick a stronger model.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'aborted':
				return { title: 'Stopped', message: 'You stopped this run.', severity: 'info', retryable: true };
			case 'no_provider':
				return {
					title: 'Connect an AI provider',
					message: 'Add an API key for Anthropic, OpenAI, Groq, Gemini or xAI to start.',
					severity: 'info',
					retryable: false,
					action: ACTIONS.settings
				};
			case 'no_tab':
				return {
					title: 'No page to work with',
					message: 'Open a normal web page in this window, then try again.',
					severity: 'warn',
					retryable: true
				};
			case 'no_host_access':
				return {
					title: 'Toolbelt can’t read this site yet',
					message: 'Allow access to this site so the tool can read the page.',
					severity: 'warn',
					retryable: false,
					action: ACTIONS.access
				};
			case 'restricted_page':
				return {
					title: 'This page can’t be read',
					message:
						'Browser pages, the Web Store and some built-in viewers block all extensions. Open a normal web page.',
					severity: 'info',
					retryable: false
				};
			case 'tab_gone':
				return {
					title: 'The tab changed',
					message: 'The tab was closed or moved to another page while working. Try again on the page you want.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'linkedin_signed_out':
				return {
					title: 'Sign in to LinkedIn',
					message: 'LinkedIn only shows full profiles when you’re signed in.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.linkedin
				};
			case 'linkedin_missing':
				return {
					title: 'Profile not found',
					message: 'This profile doesn’t exist or isn’t visible to you.',
					severity: 'warn',
					retryable: false
				};
			case 'linkedin_partial':
				return {
					title: 'Some sections couldn’t be read',
					message: 'The analysis used what loaded. Results may miss details from the skipped sections.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			case 'storage_full':
				return {
					title: 'Storage is full',
					message: 'Delete old history or memories to make room.',
					severity: 'error',
					retryable: false,
					action: ACTIONS.data
				};
			case 'account_locked':
				return {
					title: 'Toolbelt is locked',
					message: 'Unlock with your master password to use synced data and memory.',
					severity: 'info',
					retryable: false,
					action: ACTIONS.unlock
				};
			case 'sync_failed':
				return {
					title: 'Sync paused',
					message: 'Your data is safe on this device. Sync resumes when the database is reachable.',
					severity: 'warn',
					retryable: true,
					action: ACTIONS.retry
				};
			default:
				return {
					title: 'Something went wrong',
					message: 'Try again. If it keeps happening, reload the extension.',
					severity: 'error',
					retryable: true,
					action: ACTIONS.retry
				};
		}
	})();
	return { code, ...base, ...extra };
}

type Shape = {
	name?: string;
	message?: string;
	statusCode?: number;
	status?: number;
	responseBody?: string;
	responseHeaders?: Record<string, string>;
	lastError?: unknown;
	cause?: unknown;
	reason?: string;
	errors?: unknown[];
};

const asShape = (e: unknown): Shape => (typeof e === 'object' && e !== null ? (e as Shape) : { message: String(e) });

/** The innermost useful error: AI SDK RetryError keeps the real one in lastError. */
function unwrap(e: unknown): Shape {
	let s = asShape(e);
	for (let i = 0; i < 4; i++) {
		if (s.lastError) s = asShape(s.lastError);
		else if (s.name === 'AI_NoOutputGeneratedError' && s.cause) s = asShape(s.cause);
		else break;
	}
	return s;
}

function retryAfter(headers: Record<string, string> | undefined): number | undefined {
	const v = headers?.['retry-after'] ?? headers?.['Retry-After'];
	const n = v ? Number(v) : NaN;
	return Number.isFinite(n) ? n * 1000 : undefined;
}

/** Turns anything thrown into an AppError. Already-mapped errors pass through. */
export function toAppError(error: unknown, ctx: ErrorContext = {}): AppError {
	if (isAppError(error)) return error;
	const e = unwrap(error);
	const name = e.name ?? '';
	const msg = (e.message ?? '').toLowerCase();
	const body = (e.responseBody ?? '').toLowerCase();
	const status = e.statusCode ?? e.status;

	if (name === 'AbortError' || name === 'AI_AbortError' || msg.includes('aborted')) return appError('aborted', ctx);
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return appError('offline', ctx);

	if (typeof status === 'number') {
		if (status === 401) return appError('auth_invalid', ctx);
		if (status === 403) return appError('permission_denied', ctx);
		if (status === 404) return appError('model_not_found', ctx);
		if (status === 402) return appError('quota_exhausted', ctx);
		if (status === 429) {
			if (/quota|credit|billing|insufficient/.test(body)) return appError('quota_exhausted', ctx);
			return appError('rate_limited', ctx, { retryAfterMs: retryAfter(e.responseHeaders) });
		}
		if (status === 400 || status === 413) {
			if (/too long|context length|maximum context|too many tokens|prompt is too long/.test(body + msg))
				return appError('context_too_long', ctx);
			if (/credit balance|billing/.test(body)) return appError('quota_exhausted', ctx);
			if (/model/.test(body) && /not found|does not exist|invalid/.test(body)) return appError('model_not_found', ctx);
		}
		if (status >= 500) return appError('provider_unavailable', ctx);
	}

	if (/NoObjectGenerated|TypeValidation|JSONParse|InvalidToolArguments|NoSuchTool/.test(name))
		return appError('bad_output', ctx);
	if (/failed to fetch|networkerror|network error|load failed/.test(msg)) return appError('offline', ctx);
	if (/quota_bytes|quota exceeded|quotaexceeded/.test(msg) || name === 'QuotaExceededError')
		return appError('storage_full', ctx);
	if (
		/cannot be scripted|cannot access a chrome|chrome:\/\/|chrome-extension:\/\/|extensions gallery|cannot access contents of the page/.test(
			msg
		)
	)
		return appError('restricted_page', ctx);
	if (/cannot access contents of url|missing host permission|host permission/.test(msg))
		return appError('no_host_access', ctx);
	if (/no tab with id|tab was closed|receiving end does not exist|frame with id|message port closed/.test(msg))
		return appError('tab_gone', ctx);
	return appError('unknown', ctx);
}

export function isAppError(e: unknown): e is AppError {
	return typeof e === 'object' && e !== null && 'code' in e && 'title' in e && 'severity' in e && 'retryable' in e;
}

/** An Error that carries an AppError, for code paths that must throw. */
export class AppFailure extends Error {
	constructor(readonly app: AppError) {
		super(app.title);
		this.name = 'AppFailure';
	}
}

/** toAppError that also understands AppFailure. */
export function describeError(error: unknown, ctx: ErrorContext = {}): AppError {
	return error instanceof AppFailure ? error.app : toAppError(error, ctx);
}
