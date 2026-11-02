// shadcn floating layers (Tooltip, Popover, DropdownMenu, Dialog, AlertDialog) on Toolbelt tokens. Every portal
// goes to usePortalContainer(), so in-page UI keeps its styles inside the shadow root.
import {
	AlertDialog as RAlert,
	Dialog as RDialog,
	DropdownMenu as RMenu,
	Popover as RPopover,
	Tooltip as RTip
} from 'radix-ui';
import { Check, ChevronRight, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { usePortalContainer } from '../portal.tsx';
import { buttonVariants } from './button.tsx';
import { cn } from './cn.ts';

/* ---------- Tooltip ---------- */

export function TooltipProvider({
	delayDuration = 400,
	skipDelayDuration = 300,
	...props
}: ComponentProps<typeof RTip.Provider>) {
	return <RTip.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}
export const TooltipRoot = RTip.Root;
export const TooltipTrigger = RTip.Trigger;
export function TooltipContent({ className, sideOffset = 6, children, ...props }: ComponentProps<typeof RTip.Content>) {
	const container = usePortalContainer();
	return (
		<RTip.Portal container={container}>
			<RTip.Content
				sideOffset={sideOffset}
				collisionPadding={8}
				className={cn(
					'tb-pop z-[100] flex max-w-64 items-center gap-2 rounded-sm bg-ink px-2 py-1 text-sm font-medium text-bg',
					className
				)}
				{...props}
			>
				{children}
			</RTip.Content>
		</RTip.Portal>
	);
}

/* ---------- Popover ---------- */

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverAnchor = RPopover.Anchor;
export function PopoverContent({
	className,
	align = 'start',
	sideOffset = 6,
	...props
}: ComponentProps<typeof RPopover.Content>) {
	const container = usePortalContainer();
	return (
		<RPopover.Portal container={container}>
			<RPopover.Content
				align={align}
				sideOffset={sideOffset}
				collisionPadding={8}
				className={cn(
					'tb-pop z-50 w-72 max-w-[calc(100vw-16px)] rounded-xl bg-raised p-1 text-ink shadow-float outline-none',
					className
				)}
				{...props}
			/>
		</RPopover.Portal>
	);
}

/* ---------- DropdownMenu ---------- */

export const DropdownMenu = RMenu.Root;
export const DropdownMenuTrigger = RMenu.Trigger;
export const DropdownMenuGroup = RMenu.Group;
export const DropdownMenuSub = RMenu.Sub;
export const DropdownMenuRadioGroup = RMenu.RadioGroup;

const menuSurface =
	'tb-pop z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-44 overflow-x-hidden overflow-y-auto rounded-xl bg-raised p-1 text-ink shadow-float outline-none';
const menuItem =
	"relative flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-base outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-highlighted:bg-hover [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted";

export function DropdownMenuContent({
	className,
	sideOffset = 6,
	align = 'end',
	...props
}: ComponentProps<typeof RMenu.Content>) {
	const container = usePortalContainer();
	return (
		<RMenu.Portal container={container}>
			<RMenu.Content
				sideOffset={sideOffset}
				align={align}
				collisionPadding={8}
				className={cn(menuSurface, className)}
				{...props}
			/>
		</RMenu.Portal>
	);
}

export function DropdownMenuItem({
	className,
	tone,
	...props
}: ComponentProps<typeof RMenu.Item> & { tone?: 'danger' }) {
	return (
		<RMenu.Item
			className={cn(
				menuItem,
				tone === 'danger' && 'text-danger data-highlighted:bg-danger/10 [&_svg]:!text-danger',
				className
			)}
			{...props}
		/>
	);
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof RMenu.CheckboxItem>) {
	return (
		<RMenu.CheckboxItem className={cn(menuItem, 'pr-7', className)} {...props}>
			{children}
			<RMenu.ItemIndicator className="absolute right-2 flex items-center">
				<Check className="size-3.5 !text-accent-ink" />
			</RMenu.ItemIndicator>
		</RMenu.CheckboxItem>
	);
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof RMenu.RadioItem>) {
	return (
		<RMenu.RadioItem className={cn(menuItem, 'pr-7', className)} {...props}>
			{children}
			<RMenu.ItemIndicator className="absolute right-2 flex items-center">
				<Check className="size-3.5 !text-accent-ink" />
			</RMenu.ItemIndicator>
		</RMenu.RadioItem>
	);
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof RMenu.Label>) {
	return (
		<RMenu.Label className={cn('flex h-6 items-center px-2 text-xs font-medium text-faint', className)} {...props} />
	);
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof RMenu.Separator>) {
	return <RMenu.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
	return <span className={cn('ml-auto pl-4 text-sm text-faint', className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof RMenu.SubTrigger>) {
	return (
		<RMenu.SubTrigger className={cn(menuItem, 'data-[state=open]:bg-hover', className)} {...props}>
			{children}
			<ChevronRight className="ml-auto size-3.5" />
		</RMenu.SubTrigger>
	);
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof RMenu.SubContent>) {
	const container = usePortalContainer();
	return (
		<RMenu.Portal container={container}>
			<RMenu.SubContent className={cn(menuSurface, className)} {...props} />
		</RMenu.Portal>
	);
}

/* ---------- Dialog ---------- */

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

const overlayClass = 'tb-fade fixed inset-0 z-50 bg-scrim';
const dialogClass =
	'tb-pop fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-3 rounded-2xl bg-raised p-4 text-ink shadow-dialog outline-none';

export function DialogContent({
	className,
	children,
	showClose = true,
	...props
}: ComponentProps<typeof RDialog.Content> & { showClose?: boolean }) {
	const container = usePortalContainer();
	return (
		<RDialog.Portal container={container}>
			<RDialog.Overlay className={overlayClass} />
			<RDialog.Content className={cn(dialogClass, className)} {...props}>
				{children}
				{showClose && (
					<RDialog.Close
						aria-label="Close"
						className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xs' }), 'absolute top-3 right-3')}
					>
						<X />
					</RDialog.Close>
				)}
			</RDialog.Content>
		</RDialog.Portal>
	);
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
	return <div className={cn('grid gap-1 pr-6', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
	return <div className={cn('mt-1 flex flex-wrap justify-end gap-2', className)} {...props} />;
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof RDialog.Title>) {
	return <RDialog.Title className={cn('text-lg font-semibold tracking-tight', className)} {...props} />;
}
export function DialogDescription({ className, ...props }: ComponentProps<typeof RDialog.Description>) {
	return <RDialog.Description className={cn('text-base text-muted', className)} {...props} />;
}

/* ---------- AlertDialog: confirms for destructive or irreversible actions ---------- */

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	cancelLabel = 'Cancel',
	tone = 'danger',
	onConfirm,
	trigger
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: string;
	description: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	tone?: 'danger' | 'primary';
	onConfirm: () => void;
	/** The button that opens it, when the dialog manages its own open state. */
	trigger?: ReactNode;
}) {
	const container = usePortalContainer();
	return (
		<RAlert.Root open={open} onOpenChange={onOpenChange}>
			{trigger && <RAlert.Trigger asChild>{trigger}</RAlert.Trigger>}
			<RAlert.Portal container={container}>
				<RAlert.Overlay className={overlayClass} />
				<RAlert.Content className={cn(dialogClass, 'max-w-sm')}>
					<div className="grid gap-1">
						<RAlert.Title className="text-lg font-semibold tracking-tight">{title}</RAlert.Title>
						<RAlert.Description className="text-base text-muted">{description}</RAlert.Description>
					</div>
					<div className="mt-1 flex flex-wrap justify-end gap-2">
						<RAlert.Cancel className={buttonVariants({ variant: 'secondary', size: 'md' })}>
							{cancelLabel}
						</RAlert.Cancel>
						<RAlert.Action
							className={buttonVariants({ variant: tone === 'danger' ? 'danger' : 'primary', size: 'md' })}
							onClick={onConfirm}
						>
							{confirmLabel}
						</RAlert.Action>
					</div>
				</RAlert.Content>
			</RAlert.Portal>
		</RAlert.Root>
	);
}
