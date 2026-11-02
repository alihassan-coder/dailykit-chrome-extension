// How an AppError shows on screen. Blocking errors (the current task can't go on) are an inline ErrorNotice
// with its action; background failures are a toast (showError). Wording comes from @toolbelt/core.
import { describeError, type AppError, type AppErrorAction, type ErrorContext } from '@toolbelt/core';
import { Button, Notice } from './components.tsx';
import { toast } from './shadcn/misc.tsx';

export type ErrorActionHandler = (kind: AppErrorAction) => void;

export function ErrorNotice({
	error,
	onAction,
	onDismiss
}: {
	error: AppError;
	/** Runs the error's action (open settings, retry, grant access...). Without it the button is hidden. */
	onAction?: ErrorActionHandler;
	onDismiss?: () => void;
}) {
	const tone = error.severity === 'error' ? 'danger' : error.severity === 'warn' ? 'warn' : 'info';
	return (
		<Notice
			tone={tone}
			title={error.title}
			action={
				(onAction && error.action) || onDismiss ? (
					<div className="flex items-center gap-1">
						{onAction && error.action && (
							<Button size="xs" variant="plain" onClick={() => onAction(error.action!.kind)}>
								{error.action.label}
							</Button>
						)}
						{onDismiss && (
							<Button size="xs" variant="quiet" onClick={onDismiss}>
								Dismiss
							</Button>
						)}
					</div>
				) : undefined
			}
		>
			{error.message}
		</Notice>
	);
}

/** A toast for a failure that doesn't block the screen (a save, a refresh, a delete). Returns the AppError. */
export function showError(error: unknown, opts: { ctx?: ErrorContext; onAction?: ErrorActionHandler } = {}): AppError {
	const e = describeError(error, opts.ctx);
	if (e.code === 'aborted') return e;
	const show = e.severity === 'error' ? toast.error : e.severity === 'warn' ? toast.warning : toast.info;
	show(e.title, {
		description: e.message,
		action:
			opts.onAction && e.action ? { label: e.action.label, onClick: () => opts.onAction!(e.action!.kind) } : undefined
	});
	return e;
}
