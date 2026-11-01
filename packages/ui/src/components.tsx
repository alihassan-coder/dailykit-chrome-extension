// The small set of controls every Toolbelt screen is built from. Styled only with theme tokens.
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { BrandIcon } from './BrandIcon.tsx';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** The one text field look: single-line inputs and textareas share it. Add width classes as needed. */
export const inputClass =
	'min-w-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-base text-ink placeholder:text-muted transition-colors duration-100 hover:border-muted/50 focus:border-accent disabled:opacity-50 aria-[invalid=true]:border-danger';

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
				'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
				checked ? 'bg-accent' : 'bg-switch-off'
			)}
		>
			<span
				className={cx(
					'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform duration-150 ease-out',
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
		<div
			role="radiogroup"
			aria-label={label}
			className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-line bg-soft p-0.5"
		>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={o.value === value}
					onClick={() => onChange(o.value)}
					className={cx(
						'rounded-full px-3 py-1 text-sm font-medium transition-colors duration-100',
						o.value === value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'plain' | 'quiet' | 'danger';
	icon?: ReactNode;
};

export function Button({ variant = 'plain', icon, className, children, ...rest }: ButtonProps) {
	return (
		<button
			type="button"
			{...rest}
			className={cx(
				'inline-flex min-h-8 max-w-full shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-base font-medium whitespace-nowrap transition-[background-color,color,opacity,transform] duration-100 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45',
				variant === 'primary' && 'bg-accent text-on-accent enabled:hover:opacity-90',
				variant === 'plain' && 'bg-accent-soft text-accent enabled:hover:bg-accent enabled:hover:text-on-accent',
				variant === 'quiet' && 'text-accent enabled:hover:bg-accent-soft',
				variant === 'danger' && 'bg-danger text-white enabled:hover:opacity-90 dark:text-[#2b0a08]',
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
				'inline-grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-100 enabled:hover:bg-soft enabled:hover:text-ink disabled:opacity-40',
				className
			)}
		>
			{children}
		</button>
	);
}

/** A tool's logo (which brings its own coloured tile), or an initials tile until it has one. Switched-off tools fade. */
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
	if (icon) {
		return (
			<span
				aria-hidden="true"
				className={cx('grid shrink-0 transition-[filter,opacity]', active === false && 'opacity-50 grayscale')}
			>
				{icon}
			</span>
		);
	}
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
			{initials}
		</span>
	);
}

/** Keyboard key, for shortcut hints. */
export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line border-b-2 bg-surface px-1 font-mono text-xs leading-none text-muted">
			{children}
		</kbd>
	);
}

// The generated Toolbelt artwork is shared with the extension toolbar PNGs.
export function Logo({ size = 20 }: { size?: number }) {
	return <BrandIcon mark="toolbelt" size={size} />;
}

/** Empty states give direction: what this is, and the one thing to do next. */
export function EmptyState({
	title,
	body,
	action,
	icon
}: {
	title: string;
	body: string;
	action?: ReactNode;
	icon?: ReactNode;
}) {
	return (
		<div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-line px-5 py-8 text-center">
			{icon && <span className="mb-1 grid size-10 place-items-center rounded-full bg-soft text-muted">{icon}</span>}
			<p className="text-lg font-semibold text-ink">{title}</p>
			<p className="max-w-[36ch] text-base text-muted">{body}</p>
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}

/** One muted line inside a card or list: "No colours yet", "No matches". */
export function EmptyRow({ children }: { children: ReactNode }) {
	return <p className="px-3 py-3 text-sm text-muted">{children}</p>;
}

/** A surface for related content. `list` puts hairlines between its children. */
export function Card({ children, className, list }: { children: ReactNode; className?: string; list?: boolean }) {
	return (
		<div
			className={cx(
				'min-w-0 rounded-xl border border-line bg-surface shadow-card',
				list ? 'divide-y divide-line overflow-hidden' : 'p-3',
				className
			)}
		>
			{children}
		</div>
	);
}

/** A titled group inside a panel, with an optional action on the right of the title. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
	return (
		<section className="grid min-w-0 gap-1.5">
			<div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
				<h3 className="text-sm font-semibold text-muted">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}

const NOTICE_TONE = {
	info: { icon: Info, className: 'border-line bg-soft text-ink [&>svg]:text-muted' },
	ok: { icon: CircleCheck, className: 'border-ok/30 bg-ok/10 text-ink [&>svg]:text-ok' },
	warn: { icon: TriangleAlert, className: 'border-warn/30 bg-warn/10 text-ink [&>svg]:text-warn' },
	danger: { icon: CircleX, className: 'border-danger/30 bg-danger/10 text-ink [&>svg]:text-danger' }
} as const;

/** A message about what happened: an error, a warning, a success. Errors say what to do next. */
export function Notice({
	tone = 'info',
	children,
	action
}: {
	tone?: keyof typeof NOTICE_TONE;
	children: ReactNode;
	action?: ReactNode;
}) {
	const { icon: Icon, className } = NOTICE_TONE[tone];
	return (
		<div
			role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
			className={cx('flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm', className)}
		>
			<Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
			<div className="min-w-0 flex-1 wrap-anywhere">{children}</div>
			{action}
		</div>
	);
}
