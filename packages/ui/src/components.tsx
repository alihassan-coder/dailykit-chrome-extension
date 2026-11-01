// The small set of controls every Toolbelt screen is built from. Styled only with theme tokens.
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

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
				'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-base font-medium transition-colors duration-100 disabled:opacity-40',
				variant === 'primary' && 'bg-accent text-on-accent hover:opacity-90',
				variant === 'plain' && 'bg-accent-soft text-accent hover:brightness-95',
				variant === 'quiet' && 'text-accent hover:bg-accent-soft',
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

// The Holster mark: three tools tucked into a belt strap, the amber one is the tool in use.
// Spec: docs/research/design/01-extension-logo.md. Below 24 px it switches to the hand-fitted 16 px master.
const HOLSTER_16 = [
	'..........AA....',
	'.........AAA....',
	'.........AA.....',
	'....WW..AAA.....',
	'....WW..AA......',
	'...WW..AAA......',
	'...WW..AA.......',
	'................',
	'WWWWWWWWWWWWWWWW',
	'WWWWWWWWWWWWWWWW',
	'................',
	'..WW..AA........'
];

export function Logo({ size = 20 }: { size?: number }) {
	const id = useId();
	if (size < 24) {
		return (
			<svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
				<clipPath id={id}>
					<rect width="16" height="16" rx="4" />
				</clipPath>
				<g clipPath={`url(#${id})`}>
					<rect width="16" height="16" fill="#4467f5" />
					{HOLSTER_16.flatMap((row, y) =>
						[...row].map((c, x) =>
							c === '.' ? null : (
								<rect key={`${x}-${y}`} x={x} y={y + 2} width="1" height="1" fill={c === 'A' ? '#ffc53d' : '#fff'} />
							)
						)
					)}
				</g>
			</svg>
		);
	}
	return (
		<svg width={size} height={size} viewBox="16 16 96 96" aria-hidden="true">
			<clipPath id={id}>
				<rect x="16" y="16" width="96" height="96" rx="24" />
			</clipPath>
			<g clipPath={`url(#${id})`}>
				<rect x="16" y="16" width="96" height="96" fill="#4467f5" />
				<g transform="translate(24 0) skewX(-18)">
					<rect x="30" y="40" width="14" height="60" rx="7" fill="#fff" />
					<rect x="54" y="26" width="14" height="74" rx="7" fill="#ffc53d" />
					<rect x="78" y="46" width="14" height="54" rx="7" fill="#fff" />
				</g>
				<rect x="16" y="66" width="96" height="26" fill="#4467f5" />
				<rect x="16" y="70" width="96" height="18" fill="#fff" />
			</g>
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
