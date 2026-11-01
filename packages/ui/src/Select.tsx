// A dropdown that looks like the rest of Toolbelt instead of the browser's own list, built on Radix Select
// for keyboard support (arrows, type-ahead, Escape) and screen readers. Options can carry an icon.
import { Select as Radix } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePortalContainer } from './portal.tsx';

export type SelectOption<T extends string> = { value: T; label: string; icon?: ReactNode };

export function Select<T extends string>({
	value,
	options,
	onChange,
	label
}: {
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
	label: string;
}) {
	const container = usePortalContainer();
	const current = options.find((o) => o.value === value);
	return (
		<Radix.Root value={value} onValueChange={(v) => onChange(v as T)}>
			<Radix.Trigger
				aria-label={label}
				className="inline-flex h-9 min-w-52 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-3.5 text-base transition-colors hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none data-[state=open]:border-accent"
			>
				{current?.icon}
				<span className="min-w-0 flex-1 truncate text-left">
					<Radix.Value />
				</span>
				<Radix.Icon className="text-muted">
					<ChevronDown size={16} />
				</Radix.Icon>
			</Radix.Trigger>
			<Radix.Portal container={container}>
				<Radix.Content
					position="popper"
					sideOffset={6}
					className="tb-enter z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-line bg-surface p-1 text-ink shadow-float"
				>
					<Radix.Viewport>
						{options.map((o) => (
							<Radix.Item
								key={o.value}
								value={o.value}
								className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md pr-2 pl-2.5 text-base outline-none select-none data-highlighted:bg-soft data-[state=checked]:text-accent"
							>
								{o.icon}
								<Radix.ItemText>{o.label}</Radix.ItemText>
								<Radix.ItemIndicator className="ml-auto">
									<Check size={16} />
								</Radix.ItemIndicator>
							</Radix.Item>
						))}
					</Radix.Viewport>
				</Radix.Content>
			</Radix.Portal>
		</Radix.Root>
	);
}
