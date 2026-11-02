// shadcn Button on Toolbelt tokens. Dense by default (32 px), 6 px corners, one accent.
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export const buttonVariants = cva(
	"inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow,opacity] duration-100 select-none disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				primary: 'bg-accent text-on-accent shadow-xs hover:bg-accent/90',
				secondary: 'border border-line bg-surface text-ink shadow-xs hover:bg-hover',
				ghost: 'text-muted hover:bg-hover hover:text-ink',
				soft: 'bg-accent-soft text-accent-ink hover:bg-accent-soft/70',
				danger: 'bg-danger text-on-danger shadow-xs hover:bg-danger/90',
				'danger-ghost': 'text-danger hover:bg-danger/10',
				link: 'h-auto px-0 text-accent-ink underline-offset-4 hover:underline'
			},
			size: {
				xs: 'h-6 gap-1 rounded-sm px-2 text-xs',
				sm: 'h-7 px-2.5 text-sm',
				md: 'h-8 px-3 text-base',
				lg: 'h-9 px-4 text-base',
				icon: 'size-8',
				'icon-sm': 'size-7',
				'icon-xs': 'size-6 rounded-sm [&_svg:not([class*=size-])]:size-3.5'
			}
		},
		defaultVariants: { variant: 'secondary', size: 'md' }
	}
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export function UiButton({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ComponentProps<'button'> & ButtonVariantProps & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : 'button';
	return (
		<Comp
			data-slot="button"
			type={asChild ? undefined : (props.type ?? 'button')}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}
