// shadcn Command (cmdk) on Toolbelt tokens: the search list used by the command palette, the header search
// and searchable pickers. Filtering is left to the caller when it passes `shouldFilter={false}`.
import { Command as Cmdk } from 'cmdk';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export function CommandRoot({ className, ...props }: ComponentProps<typeof Cmdk>) {
	return <Cmdk className={cn('flex min-h-0 w-full flex-col overflow-hidden text-ink', className)} {...props} />;
}

export function CommandInput({ className, ...props }: ComponentProps<typeof Cmdk.Input>) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3" cmdk-input-wrapper="">
			<Search className="size-4 shrink-0 text-faint" aria-hidden="true" />
			<Cmdk.Input
				className={cn(
					'h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint',
					className
				)}
				{...props}
			/>
		</div>
	);
}

export function CommandList({ className, ...props }: ComponentProps<typeof Cmdk.List>) {
	return (
		<Cmdk.List className={cn('max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1', className)} {...props} />
	);
}

export function CommandEmpty({ className, ...props }: ComponentProps<typeof Cmdk.Empty>) {
	return <Cmdk.Empty className={cn('px-2 py-6 text-center text-sm text-faint', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof Cmdk.Group>) {
	return (
		<Cmdk.Group
			className={cn(
				'[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-6 [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint',
				className
			)}
			{...props}
		/>
	);
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof Cmdk.Separator>) {
	return <Cmdk.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}

export function CommandItem({ className, ...props }: ComponentProps<typeof Cmdk.Item>) {
	return (
		<Cmdk.Item
			className={cn(
				"relative flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-base outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45 data-[selected=true]:bg-hover [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}
		/>
	);
}

export function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
	return <span className={cn('ml-auto pl-3 text-sm text-faint', className)} {...props} />;
}
