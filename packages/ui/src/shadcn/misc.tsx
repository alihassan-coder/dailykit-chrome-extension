// Small shadcn pieces on Toolbelt tokens: Badge, Skeleton, Separator, Tabs, Collapsible, Checkbox, Toaster.
import { Checkbox as RCheckbox, Collapsible as RCollapsible, Separator as RSeparator, Tabs as RTabs } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Toaster as Sonner, toast } from 'sonner';
import { cn } from './cn.ts';

export { toast };

/* ---------- Badge ---------- */

export const badgeVariants = cva(
	'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
	{
		variants: {
			tone: {
				neutral: 'bg-soft text-muted',
				outline: 'border border-line text-muted',
				accent: 'bg-accent-soft text-accent-ink',
				ok: 'bg-ok/12 text-ok',
				warn: 'bg-warn/14 text-warn',
				danger: 'bg-danger/12 text-danger'
			}
		},
		defaultVariants: { tone: 'neutral' }
	}
);

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A coloured status dot: synced, paused, error. Pair it with text; colour alone is not the message. */
export function StatusDot({
	tone = 'ok',
	className
}: {
	tone?: 'ok' | 'warn' | 'danger' | 'idle';
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'inline-block size-1.5 shrink-0 rounded-full',
				tone === 'ok' && 'bg-ok',
				tone === 'warn' && 'bg-warn',
				tone === 'danger' && 'bg-danger',
				tone === 'idle' && 'bg-faint',
				className
			)}
		/>
	);
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
	return <div aria-hidden="true" className={cn('animate-shimmer rounded-md bg-soft', className)} {...props} />;
}

/* ---------- Separator ---------- */

export function Separator({ className, orientation = 'horizontal', ...props }: ComponentProps<typeof RSeparator.Root>) {
	return (
		<RSeparator.Root
			orientation={orientation}
			className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
			{...props}
		/>
	);
}

/* ---------- Tabs (underline style, dense) ---------- */

export const Tabs = RTabs.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof RTabs.List>) {
	return <RTabs.List className={cn('flex h-8 items-stretch gap-3 border-b border-line', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof RTabs.Trigger>) {
	return (
		<RTabs.Trigger
			className={cn(
				'relative -mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-0.5 text-base font-medium text-faint transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink [&_svg]:size-3.5',
				className
			)}
			{...props}
		/>
	);
}
export function TabsContent({ className, ...props }: ComponentProps<typeof RTabs.Content>) {
	return <RTabs.Content className={cn('min-w-0 outline-none', className)} {...props} />;
}

/* ---------- Collapsible ---------- */

export const Collapsible = RCollapsible.Root;
export const CollapsibleTrigger = RCollapsible.Trigger;
export const CollapsibleContent = RCollapsible.Content;

/* ---------- Checkbox ---------- */

export function Checkbox({ className, ...props }: ComponentProps<typeof RCheckbox.Root>) {
	return (
		<RCheckbox.Root
			className={cn(
				'peer grid size-4 shrink-0 place-items-center rounded-xs border border-line-strong bg-surface transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent disabled:opacity-50',
				className
			)}
			{...props}
		>
			<RCheckbox.Indicator>
				<Check className="size-3" strokeWidth={3} />
			</RCheckbox.Indicator>
		</RCheckbox.Root>
	);
}

/* ---------- Toaster (sonner) ---------- */

/** Mount once per surface, inside the themed root. Call `toast(...)` anywhere. */
export function Toaster(props: ComponentProps<typeof Sonner>) {
	return (
		<Sonner
			position="bottom-center"
			visibleToasts={3}
			closeButton={false}
			gap={6}
			offset={12}
			toastOptions={{ duration: 4000 }}
			{...props}
		/>
	);
}
