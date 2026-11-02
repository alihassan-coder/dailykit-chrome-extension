// Building blocks every dashboard section uses: one page header, bordered groups of dense rows, a secret
// field with show/hide, the shared API key store and a reactive media query.
import { resolveApiKeys, toolValue, type ApiKeys } from '@toolbelt/core';
import { IconButton, Input, cn, localArea, showError } from '@toolbelt/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';

export function SettingsHeader({
	id,
	title,
	description,
	meta
}: {
	id: string;
	title: string;
	description: string;
	meta?: ReactNode;
}) {
	return (
		<header className="flex items-end justify-between gap-4">
			<div className="grid min-w-0 gap-0.5">
				<h2 id={id} className="text-2xl font-semibold tracking-tight">
					{title}
				</h2>
				<p className="truncate text-base text-muted">{description}</p>
			</div>
			{meta && <div className="shrink-0 text-sm text-faint tb-num">{meta}</div>}
		</header>
	);
}

/** A titled, bordered list of rows. */
export function SettingsGroup({
	title,
	meta,
	children,
	className
}: {
	title?: string;
	meta?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className="grid min-w-0 gap-1.5">
			{title && (
				<div className="flex h-6 items-center gap-2 px-0.5">
					<h3 className="text-xs font-medium text-faint">{title}</h3>
					{meta && <span className="ml-auto text-xs text-faint tb-num">{meta}</span>}
				</div>
			)}
			<div
				className={cn(
					'min-w-0 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface',
					className
				)}
			>
				{children}
			</div>
		</section>
	);
}

/** Label and hint on the left, the control on the right. */
export function SettingsRow({
	label,
	hint,
	children,
	icon,
	htmlFor
}: {
	label: ReactNode;
	hint?: ReactNode;
	children?: ReactNode;
	icon?: ReactNode;
	htmlFor?: string;
}) {
	return (
		<div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
			{icon && <span className="grid shrink-0 text-muted [&_svg]:size-4">{icon}</span>}
			<div className="grid min-w-0 flex-1 basis-56 gap-0.5">
				{htmlFor ? (
					<label htmlFor={htmlFor} className="truncate text-base font-medium">
						{label}
					</label>
				) : (
					<p className="truncate text-base font-medium">{label}</p>
				)}
				{hint && <p className="text-sm text-faint">{hint}</p>}
			</div>
			{children && <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{children}</div>}
		</div>
	);
}

/** A password-style input with a show/hide toggle. */
export function SecretInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
	const [show, setShow] = useState(false);
	return (
		<div className="relative min-w-0 flex-1">
			<Input
				{...props}
				type={show ? 'text' : 'password'}
				autoComplete={props.autoComplete ?? 'off'}
				spellCheck={false}
				className={cn('pr-9', className)}
			/>
			<span className="absolute top-1/2 right-1 -translate-y-1/2">
				<IconButton size="xs" type="button" label={show ? 'Hide' : 'Show'} onClick={() => setShow((s) => !s)}>
					{show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
				</IconButton>
			</span>
		</div>
	);
}

/** Saved provider credentials (storage.local; synced encrypted when account sync is on). */
export const keysStore = toolValue(localArea, 'ai', 'keys', resolveApiKeys);

export function useApiKeys(): ApiKeys | null {
	const [keys, setKeys] = useState<ApiKeys | null>(null);
	useEffect(() => {
		let alive = true;
		keysStore
			.get()
			.then((k) => alive && setKeys(k))
			.catch((e: unknown) => showError(e));
		const stop = keysStore.subscribe(setKeys);
		return () => {
			alive = false;
			stop();
		};
	}, []);
	return keys;
}

/** A media query that re-renders when it changes. */
export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(onChange) => {
			if (typeof matchMedia === 'undefined') return () => {};
			const m = matchMedia(query);
			m.addEventListener('change', onChange);
			return () => m.removeEventListener('change', onChange);
		},
		() => (typeof matchMedia === 'undefined' ? false : matchMedia(query).matches),
		() => false
	);
}
