// The small set of controls every Toolbelt screen is built from: thin, stable wrappers over the shadcn
// primitives in ./shadcn, styled only with theme tokens. Screens import these; new screens can also use the
// primitives directly.
import { Switch as RSwitch, ToggleGroup } from 'radix-ui';
import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { BrandIcon } from './BrandIcon.tsx';
import { Tooltip } from './Tooltip.tsx';
import { UiButton, type ButtonVariantProps } from './shadcn/button.tsx';
import { cn } from './shadcn/cn.ts';
import { fieldClass } from './shadcn/fields.tsx';

/** The one text field look: single-line inputs and textareas share it. Add width or height classes as needed. */
export const inputClass = cn(fieldClass, 'h-8');

export function Switch({
	checked,
	onChange,
	label,
	disabled,
	size = 'md'
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	disabled?: boolean;
	size?: 'sm' | 'md';
}) {
	return (
		<RSwitch.Root
			checked={checked}
			onCheckedChange={onChange}
			aria-label={label}
			disabled={disabled}
			className={cn(
				'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-accent data-[state=unchecked]:bg-switch-off',
				size === 'md' ? 'h-[18px] w-8' : 'h-4 w-7'
			)}
		>
			<RSwitch.Thumb
				className={cn(
					'block rounded-full bg-thumb shadow-xs transition-transform duration-150 ease-out data-[state=unchecked]:translate-x-0',
					size === 'md' ? 'size-3.5 data-[state=checked]:translate-x-3.5' : 'size-3 data-[state=checked]:translate-x-3'
				)}
			/>
		</RSwitch.Root>
	);
}

/** A segmented control for 2–4 choices (Radix ToggleGroup: arrow keys move, one tab stop). */
export function Segmented<T extends string>({
	value,
	options,
	onChange,
	label,
	size = 'md'
}: {
	value: T;
	options: { value: T; label: string; icon?: ReactNode }[];
	onChange: (value: T) => void;
	label: string;
	size?: 'sm' | 'md';
}) {
	return (
		<ToggleGroup.Root
			type="single"
			value={value}
			onValueChange={(v) => v && onChange(v as T)}
			aria-label={label}
			className={cn(
				'inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md bg-soft p-0.5',
				size === 'md' ? 'min-h-7' : 'min-h-6'
			)}
		>
			{options.map((o) => (
				<ToggleGroup.Item
					key={o.value}
					value={o.value}
					aria-label={o.label}
					className={cn(
						'inline-flex items-center gap-1.5 rounded-sm px-2.5 font-medium text-faint transition-colors duration-100 hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_1px_var(--tb-line)] [&_svg]:size-3.5',
						size === 'md' ? 'h-6 text-sm' : 'h-5 text-xs'
					)}
				>
					{o.icon}
					{o.label}
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	);
}

type LegacyVariant = 'primary' | 'plain' | 'quiet' | 'danger';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	/** plain = neutral outlined, quiet = no fill. The shadcn names work too. */
	variant?: LegacyVariant | NonNullable<ButtonVariantProps['variant']>;
	size?: 'xs' | 'sm' | 'md' | 'lg';
	icon?: ReactNode;
	/** Shows a spinner and blocks clicks while work runs. */
	loading?: boolean;
};

const VARIANT: Record<LegacyVariant, NonNullable<ButtonVariantProps['variant']>> = {
	primary: 'primary',
	plain: 'secondary',
	quiet: 'ghost',
	danger: 'danger'
};

export function Button({
	variant = 'plain',
	size = 'md',
	icon,
	loading,
	className,
	children,
	disabled,
	...rest
}: ButtonProps) {
	const v =
		variant in VARIANT ? VARIANT[variant as LegacyVariant] : (variant as NonNullable<ButtonVariantProps['variant']>);
	return (
		<UiButton
			variant={v}
			size={size}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={cn('max-w-full', className)}
			{...rest}
		>
			{loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
			{children}
		</UiButton>
	);
}

/** An icon-only button. Always named; shows its name as a tooltip. */
export function IconButton({
	label,
	hint,
	children,
	className,
	size = 'sm',
	side = 'bottom',
	active,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string;
	hint?: string;
	size?: 'xs' | 'sm' | 'md';
	side?: 'top' | 'bottom' | 'left' | 'right';
	/** Pressed look for toggles (e.g. a panel that is open). */
	active?: boolean;
}) {
	return (
		<Tooltip label={label} hint={hint} side={side}>
			<UiButton
				variant="ghost"
				size={size === 'xs' ? 'icon-xs' : size === 'sm' ? 'icon-sm' : 'icon'}
				aria-label={label}
				className={cn(active && 'bg-hover text-ink', className)}
				{...rest}
			>
				{children}
			</UiButton>
		</Tooltip>
	);
}

/** A tool's logo (which brings its own tile), or an initials tile until it has one. Switched-off tools fade. */
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
				className={cn('grid shrink-0 transition-[filter,opacity]', active === false && 'opacity-45 grayscale')}
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
			className={cn(
				'grid shrink-0 place-items-center rounded-md border border-line font-semibold',
				size === 'sm' && 'size-5 text-2xs',
				size === 'md' && 'size-7 text-xs',
				size === 'lg' && 'size-9 text-sm',
				active ? 'bg-accent-soft text-accent-ink' : 'bg-soft text-muted'
			)}
		>
			{initials}
		</span>
	);
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/** Keyboard key, for shortcut hints. "Mod" shows as ⌘ on a Mac and Ctrl elsewhere. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	const text = children === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : children;
	return (
		<kbd
			className={cn(
				'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-line bg-soft px-1 font-ui text-2xs leading-none font-medium text-muted',
				className
			)}
		>
			{text}
		</kbd>
	);
}

/** Several keys pressed together: <KbdGroup keys={['Mod', 'K']} />. */
export function KbdGroup({ keys, className }: { keys: string[]; className?: string }) {
	return (
		<span className={cn('inline-flex items-center gap-0.5', className)}>
			{keys.map((k) => (
				<Kbd key={k}>{k}</Kbd>
			))}
		</span>
	);
}

export function Logo({ size = 20 }: { size?: number }) {
	return <BrandIcon mark="toolbelt" size={size} />;
}

/** Empty states give direction: what this is, and the one thing to do next. Compact; no dashed box. */
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
		<div className="grid justify-items-center gap-1.5 px-4 py-6 text-center">
			{icon && (
				<span className="mb-1 grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted shadow-xs [&_svg]:size-4">
					{icon}
				</span>
			)}
			<p className="text-lg font-semibold tracking-tight text-ink">{title}</p>
			<p className="max-w-[38ch] text-base text-muted">{body}</p>
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}

/** One muted line inside a card or list: "No colours yet", "No matches". */
export function EmptyRow({ children }: { children: ReactNode }) {
	return <p className="px-3 py-2.5 text-sm text-faint">{children}</p>;
}

/** A surface for related content. `list` puts hairlines between its children. Flat: border, no shadow. */
export function Card({ children, className, list }: { children: ReactNode; className?: string; list?: boolean }) {
	return (
		<div
			className={cn(
				'min-w-0 rounded-lg border border-line bg-surface',
				list ? 'divide-y divide-line overflow-hidden' : 'p-3',
				className
			)}
		>
			{children}
		</div>
	);
}

/** A titled group inside a panel, with an optional count and an action on the right of the title. */
export function Section({
	title,
	action,
	count,
	children
}: {
	title: string;
	action?: ReactNode;
	count?: number | string;
	children: ReactNode;
}) {
	return (
		<section className="grid min-w-0 gap-1">
			<div className="flex h-6 items-center gap-1.5 px-0.5">
				<h3 className="text-xs font-medium text-faint">{title}</h3>
				{count !== undefined && <span className="tb-num text-xs text-faint/80">{count}</span>}
				{action && <div className="ml-auto flex items-center gap-1">{action}</div>}
			</div>
			{children}
		</section>
	);
}

const NOTICE_TONE = {
	info: { icon: Info, className: 'border-line bg-soft/60 [&>svg]:text-muted' },
	ok: { icon: CircleCheck, className: 'border-ok/25 bg-ok/8 [&>svg]:text-ok' },
	warn: { icon: TriangleAlert, className: 'border-warn/30 bg-warn/8 [&>svg]:text-warn' },
	danger: { icon: CircleX, className: 'border-danger/30 bg-danger/8 [&>svg]:text-danger' }
} as const;

/** A message about what happened: an error, a warning, a success. Errors say what to do next. */
export function Notice({
	tone = 'info',
	title,
	children,
	action
}: {
	tone?: keyof typeof NOTICE_TONE;
	title?: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	const { icon: Icon, className } = NOTICE_TONE[tone];
	return (
		<div
			role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
			className={cn('flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2 text-sm text-ink', className)}
		>
			<Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
			<div className="grid min-w-0 flex-1 gap-0.5 wrap-anywhere">
				{title && <p className="font-medium">{title}</p>}
				<div className={cn(title && 'text-muted')}>{children}</div>
			</div>
			{action && <div className="-my-0.5 shrink-0">{action}</div>}
		</div>
	);
}
