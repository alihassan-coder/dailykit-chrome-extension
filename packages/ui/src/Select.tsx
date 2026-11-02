// shadcn-style Select on Radix: keyboard support (arrows, type-ahead, Escape) and screen readers. Options can
// carry an icon and a description, and can be grouped. Dense: 32 px trigger, 28 px items, check on the right.
import { Select as Radix } from 'radix-ui';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { usePortalContainer } from './portal.tsx';
import { cn } from './shadcn/cn.ts';

export type SelectOption<T extends string> = {
	value: T;
	label: string;
	icon?: ReactNode;
	/** One short line under the label in the list (not in the trigger). */
	description?: string;
	/** Options with the same group are listed together under that heading. */
	group?: string;
	disabled?: boolean;
};

export function Select<T extends string>({
	value,
	options,
	onChange,
	label,
	placeholder,
	size = 'md',
	className = 'w-full'
}: {
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
	label: string;
	placeholder?: string;
	size?: 'sm' | 'md';
	/** Width of the trigger; it fills its slot by default and never grows past it. */
	className?: string;
}) {
	const container = usePortalContainer();
	const current = options.find((o) => o.value === value);
	const groups = [...new Set(options.map((o) => o.group))];
	return (
		<Radix.Root value={value} onValueChange={(v) => onChange(v as T)}>
			<Radix.Trigger
				aria-label={label}
				className={cn(
					'inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface pr-2 pl-2.5 text-base text-ink shadow-xs transition-[border-color,box-shadow] outline-none hover:border-line-strong focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 data-[state=open]:border-accent [&_svg]:shrink-0',
					size === 'md' ? 'h-8' : 'h-7 text-sm',
					className
				)}
			>
				{current?.icon}
				<span className="min-w-0 flex-1 truncate text-left">
					<Radix.Value placeholder={placeholder} />
				</span>
				<Radix.Icon className="text-faint">
					<ChevronsUpDown size={14} />
				</Radix.Icon>
			</Radix.Trigger>
			<Radix.Portal container={container}>
				<Radix.Content
					position="popper"
					sideOffset={4}
					collisionPadding={8}
					className="tb-pop z-50 max-h-[min(320px,var(--radix-select-content-available-height))] max-w-(--radix-select-content-available-width) min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl bg-raised p-1 text-ink shadow-float"
				>
					<Radix.Viewport>
						{groups.map((group, gi) => (
							<Fragment key={group ?? '_'}>
								{gi > 0 && <Radix.Separator className="-mx-1 my-1 h-px bg-line" />}
								<Radix.Group>
									{group && (
										<Radix.Label className="flex h-6 items-center px-2 text-xs font-medium text-faint">
											{group}
										</Radix.Label>
									)}
									{options
										.filter((o) => o.group === group)
										.map((o) => (
											<Radix.Item
												key={o.value}
												value={o.value}
												disabled={o.disabled}
												className={cn(
													'relative flex cursor-default items-center gap-2 rounded-md pr-7 pl-2 text-base outline-none select-none data-disabled:opacity-45 data-highlighted:bg-hover [&_svg]:shrink-0',
													o.description ? 'min-h-10 py-1' : 'h-7'
												)}
											>
												{o.icon}
												<span className="grid min-w-0 flex-1">
													<span className="truncate">
														<Radix.ItemText>{o.label}</Radix.ItemText>
													</span>
													{o.description && <span className="truncate text-sm text-faint">{o.description}</span>}
												</span>
												<Radix.ItemIndicator className="absolute right-2 flex items-center">
													<Check size={14} className="text-accent-ink" />
												</Radix.ItemIndicator>
											</Radix.Item>
										))}
								</Radix.Group>
							</Fragment>
						))}
					</Radix.Viewport>
				</Radix.Content>
			</Radix.Portal>
		</Radix.Root>
	);
}
