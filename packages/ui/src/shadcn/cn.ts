// shadcn's class helper, taught Toolbelt's token names so `text-sm text-ink` keeps both classes (size and colour)
// and `bg-soft bg-accent` keeps only the last.
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			color: [
				'bg',
				'surface',
				'raised',
				'soft',
				'hover',
				'line',
				'line-strong',
				'ink',
				'muted',
				'faint',
				'accent',
				'accent-ink',
				'accent-soft',
				'on-accent',
				'ok',
				'warn',
				'danger',
				'on-danger',
				'switch-off',
				'thumb',
				'scrim'
			],
			text: ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl'],
			radius: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full'],
			shadow: ['xs', 'card', 'float', 'dialog']
		}
	}
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
