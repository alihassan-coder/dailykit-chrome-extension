// The small set of controls every Toolbelt screen is built from. Styled only with theme tokens.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function Switch({
	checked,
	onChange,
	label,
	disabled
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cx(
				'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-100 disabled:opacity-40',
				checked ? 'bg-accent' : 'bg-line'
			)}
		>
			<span
				className={cx(
					'absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-float transition-transform duration-100',
					checked && 'translate-x-4'
				)}
			/>
		</button>
	);
}

export function Segmented<T extends string>({
	value,
	options,
	onChange,
	label
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	label: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={o.value === value}
					onClick={() => onChange(o.value)}
					className={cx(
						'rounded-sm px-3 py-1 text-sm transition-colors duration-100',
						o.value === value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'plain' | 'quiet';
	icon?: ReactNode;
};

export function Button({ variant = 'plain', icon, className, children, ...rest }: ButtonProps) {
	return (
		<button
			type="button"
			{...rest}
			className={cx(
				'inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-100 disabled:opacity-40',
				variant === 'primary' && 'bg-accent text-on-accent hover:opacity-90',
				variant === 'plain' && 'border border-line bg-surface text-ink hover:bg-soft',
				variant === 'quiet' && 'text-muted hover:bg-soft hover:text-ink',
				className
			)}
		>
			{icon}
			{children}
		</button>
	);
}

export function IconButton({
	label,
	children,
	className,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			{...rest}
			className={cx(
				'inline-grid size-8 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-soft hover:text-ink',
				className
			)}
		>
			{children}
		</button>
	);
}

/** A tool's square tile with its logo (or initials until it has one), echoing the four-square logo. */
export function ToolMark({
	name,
	icon,
	active,
	size = 'md'
}: {
	name: string;
	icon?: ReactNode;
	active?: boolean;
	size?: 'sm' | 'md' | 'lg';
}) {
	const initials = name
		.split(/\s+/)
		.map((w) => w[0])
		.join('')
		.slice(0, 2);
	return (
		<span
			aria-hidden="true"
			className={cx(
				'grid shrink-0 place-items-center rounded-md font-semibold transition-colors',
				size === 'sm' && 'size-6 text-xs',
				size === 'md' && 'size-8 text-sm',
				size === 'lg' && 'size-11 text-base',
				active ? 'bg-accent text-on-accent' : 'bg-soft text-ink'
			)}
		>
			{icon ?? initials}
		</span>
	);
}

/** Keyboard key, for shortcut hints. */
export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="rounded-sm border border-line bg-surface px-1.5 py-px font-ui text-xs text-muted">{children}</kbd>
	);
}

/** The Toolbelt logo: four squares, one in the accent colour. */
export function Logo({ size = 20 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
			<rect x="0" y="0" width="9" height="9" rx="2" fill="var(--tb-ink)" />
			<rect x="11" y="0" width="9" height="9" rx="2" fill="var(--tb-accent)" />
			<rect x="0" y="11" width="9" height="9" rx="2" fill="var(--tb-ink)" opacity="0.45" />
			<rect x="11" y="11" width="9" height="9" rx="2" fill="var(--tb-ink)" opacity="0.2" />
		</svg>
	);
}

/** Empty states give direction: what this is, and the one thing to do next. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
	return (
		<div className="grid justify-items-start gap-2 rounded-md border border-dashed border-line p-4">
			<p className="font-semibold text-ink">{title}</p>
			<p className="text-sm text-muted">{body}</p>
			{action}
		</div>
	);
}
