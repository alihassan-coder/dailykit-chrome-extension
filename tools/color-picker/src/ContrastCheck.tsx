// Contrast between two colours: the current one as the background, a second one as the text, with the WCAG
// ratio and AA / AAA grades for normal and large text.
import { Badge, IconButton, Section, Tooltip, cn } from '@toolbelt/ui';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { contrastGrades, contrastRatio, formats, readableOn, type Hex } from './colors.ts';

function Grade({ label, pass, level }: { label: string; pass: boolean; level: 'AA' | 'AAA' }) {
	const Icon = pass ? Check : X;
	return (
		<Badge
			tone={pass ? 'ok' : 'danger'}
			aria-label={`${label} ${level}: ${pass ? 'passes' : 'fails'}`}
			className="gap-1"
		>
			<Icon className="size-3" aria-hidden="true" />
			{level}
		</Badge>
	);
}

export function ContrastCheck({
	background,
	text,
	choices,
	onText,
	onSwap
}: {
	background: Hex;
	/** The text colour; null picks black or white, whichever reads better. */
	text: Hex | null;
	/** Colours to choose the text colour from (recent and page colours). */
	choices: Hex[];
	onText: (hex: Hex) => void;
	onSwap: (text: Hex) => void;
}) {
	const fg = text ?? readableOn(background);
	const ratio = contrastRatio(background, fg);
	const grades = contrastGrades(ratio);
	const options = [...new Set<Hex>(['#ffffff', '#000000', ...choices])].filter((h) => h !== background).slice(0, 14);
	return (
		<Section
			title="Contrast"
			action={
				<IconButton size="xs" label="Swap text and background" onClick={() => onSwap(fg)}>
					<ArrowLeftRight aria-hidden="true" />
				</IconButton>
			}
		>
			<div className="grid min-w-0 overflow-hidden rounded-lg border border-line bg-surface">
				<div className="flex min-w-0 items-stretch">
					{/* Both colours are data, so the sample uses inline styles rather than tokens. */}
					<div
						className="grid min-w-0 flex-1 content-center gap-0.5 px-3 py-2"
						style={{ background, color: fg }}
						aria-hidden="true"
					>
						<p className="truncate text-base">Normal text, 13 px</p>
						<p className="truncate text-xl font-semibold">Large text</p>
					</div>
					<div className="grid w-28 shrink-0 content-center gap-1 border-l border-line px-2.5 py-2">
						<p className="text-ink" aria-label={`Contrast ratio ${ratio.toFixed(2)} to 1`}>
							<span className="tb-num text-xl font-semibold">{ratio.toFixed(2)}</span>
							<span className="text-sm text-faint"> : 1</span>
						</p>
						<p className="tb-num truncate text-xs text-faint">
							Text <span className="font-mono">{formats(fg).hex}</span>
						</p>
					</div>
				</div>
				<div className="grid grid-cols-2 border-t border-line">
					<div className="flex h-8 min-w-0 items-center gap-1.5 px-2.5">
						<span className="min-w-0 flex-1 truncate text-sm text-muted">
							Normal<span className="sr-only"> text</span>
						</span>
						<Grade label="Normal text" level="AA" pass={grades.normalAA} />
						<Grade label="Normal text" level="AAA" pass={grades.normalAAA} />
					</div>
					<div className="flex h-8 min-w-0 items-center gap-1.5 border-l border-line px-2.5">
						<span className="min-w-0 flex-1 truncate text-sm text-muted">
							Large<span className="sr-only"> text</span>
						</span>
						<Grade label="Large text" level="AA" pass={grades.largeAA} />
						<Grade label="Large text" level="AAA" pass={grades.largeAAA} />
					</div>
				</div>
				<div
					className="flex min-w-0 flex-wrap items-center gap-1 border-t border-line px-2.5 py-1.5"
					role="group"
					aria-label="Text colour"
				>
					<span className="mr-1 text-xs text-faint">Text</span>
					{options.map((hex) => (
						<Tooltip key={hex} label={`Text ${formats(hex).hex}`} side="bottom">
							<button
								type="button"
								aria-label={`Text ${formats(hex).hex}`}
								aria-pressed={hex === fg}
								onClick={() => onText(hex)}
								className={cn(
									'size-5 cursor-pointer rounded-xs shadow-[inset_0_0_0_1px_var(--tb-line-strong)]',
									hex === fg && 'ring-2 ring-accent-ink ring-offset-1 ring-offset-surface'
								)}
								style={{ background: hex }}
							/>
						</Tooltip>
					))}
				</div>
			</div>
		</Section>
	);
}
