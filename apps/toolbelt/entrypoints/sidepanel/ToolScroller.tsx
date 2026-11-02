// One tool's own scroll area and tab panel. Tools you opened stay mounted while hidden (a chat or half-typed
// text survives switching away), and each keeps its scroll position. Tools reach the scroll element through
// PanelScrollProvider.
import { PanelScrollProvider, Skeleton } from '@toolbelt/ui';
import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { panelId, tabId } from './ToolIcon.tsx';

export function ToolScroller({ id, shown, children }: { id: string; shown: boolean; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const saved = useRef(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el && shown) el.scrollTop = saved.current;
	}, [shown]);
	return (
		<div
			ref={ref}
			id={panelId(id)}
			role="tabpanel"
			aria-labelledby={tabId(id)}
			hidden={!shown}
			onScroll={(e) => {
				saved.current = e.currentTarget.scrollTop;
			}}
			className="@container min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
		>
			<PanelScrollProvider value={ref}>
				{/* A 12 px gutter: tool panels pull full-bleed bars out of it with -mx-3. */}
				<div className="tb-enter mx-auto flex min-h-full w-full max-w-[560px] min-w-0 flex-col p-3">
					<Suspense fallback={<PanelSkeleton />}>{children}</Suspense>
				</div>
			</PanelScrollProvider>
		</div>
	);
}

function PanelSkeleton() {
	return (
		<div className="grid gap-2" role="status" aria-label="Loading">
			<Skeleton className="h-8" />
			<Skeleton className="h-8 w-3/4" />
			<Skeleton className="h-24" />
		</div>
	);
}
