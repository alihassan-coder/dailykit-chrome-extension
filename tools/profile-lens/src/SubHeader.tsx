// A sub-screen header: back, title, and optional actions on the right. Sets and History both use it.
import { IconButton } from '@toolbelt/ui';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function SubHeader({
	title,
	onBack,
	backLabel = 'Back',
	meta,
	action
}: {
	title: string;
	onBack: () => void;
	backLabel?: string;
	/** A count or status after the title, e.g. "24". */
	meta?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex h-8 min-w-0 items-center gap-1">
			<IconButton label={backLabel} onClick={onBack} className="-ml-1">
				<ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
			</IconButton>
			<h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
			{meta !== undefined && <span className="tb-num text-sm text-faint">{meta}</span>}
			<div className="ml-auto flex shrink-0 items-center gap-1">{action}</div>
		</div>
	);
}
