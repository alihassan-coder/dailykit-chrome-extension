// shadcn Input, Textarea and Label on Toolbelt tokens. Focus: accent border plus a soft ring (no outline).
import { Label as RadixLabel } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export const fieldClass =
	'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 text-base text-ink shadow-xs transition-[border-color,box-shadow] duration-100 outline-none placeholder:text-faint hover:border-line-strong focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/20';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
	return <input type={type} data-slot="input" className={cn(fieldClass, 'h-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
	return (
		<textarea data-slot="textarea" className={cn(fieldClass, 'min-h-16 resize-none py-1.5', className)} {...props} />
	);
}

export function Label({ className, ...props }: ComponentProps<typeof RadixLabel.Root>) {
	return (
		<RadixLabel.Root
			data-slot="label"
			className={cn('text-sm font-medium text-ink select-none peer-disabled:opacity-50', className)}
			{...props}
		/>
	);
}
