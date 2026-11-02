// One analysed profile: who they are (a short summary and quick facts computed from the dates), how well they
// match your ICP (once: a ring and a verdict badge), the answer to each of your questions as a dense definition
// list with its confidence (quotes from the profile fold out; unsure answers say what's missing), and the facts.
import { Badge, Card, Collapsible, CollapsibleContent, CollapsibleTrigger, Section, StatusDot, cn } from '@toolbelt/ui';
import { Briefcase, Building2, ChevronRight, MapPin } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Analysis, Answer, Confidence, Field, QuestionSet, Verdict } from './fields.ts';
import { formatMonths, type ComputedFacts } from './structured.ts';

export const VERDICT: Record<
	Verdict,
	{ label: string; short: string; tone: 'ok' | 'accent' | 'warn' | 'neutral'; ring: string }
> = {
	strong: { label: 'Strong match', short: 'Strong', tone: 'ok', ring: 'text-ok' },
	possible: { label: 'Possible match', short: 'Possible', tone: 'accent', ring: 'text-accent-ink' },
	weak: { label: 'Weak match', short: 'Weak', tone: 'warn', ring: 'text-warn' },
	no: { label: 'Not a match', short: 'No match', tone: 'neutral', ring: 'text-faint' }
};

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]!.toUpperCase())
		.join('') || '?';

/** LinkedIn photo links expire; falls back to initials when one fails to load. */
export function Avatar({ src, name, size = 28 }: { src?: string | null; name: string; size?: 24 | 28 | 36 }) {
	const [broken, setBroken] = useState<string | null>(null);
	const box = size === 24 ? 'size-6 text-2xs' : size === 28 ? 'size-7 text-xs' : 'size-9 text-sm';
	if (src && broken !== src)
		return (
			<img
				src={src}
				alt=""
				onError={() => setBroken(src)}
				className={cn('shrink-0 rounded-full bg-soft object-cover ring-1 ring-line', box)}
			/>
		);
	return (
		<span
			aria-hidden="true"
			className={cn(
				'grid shrink-0 place-items-center rounded-full bg-soft font-medium text-muted ring-1 ring-line',
				box
			)}
		>
			{initials(name)}
		</span>
	);
}

/** Who this is, in one row: photo, name, headline and a meta line on the right. */
export function Identity({
	name,
	photo,
	headline,
	url,
	meta
}: {
	name: string;
	photo: string | null;
	headline?: string;
	url: string;
	meta?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar src={photo} name={name} />
			<div className="min-w-0 flex-1">
				<a href={url} target="_blank" rel="noreferrer" className="block truncate font-medium text-ink hover:underline">
					{name}
				</a>
				{headline && <p className="truncate text-sm text-muted">{headline}</p>}
			</div>
			{meta && <span className="shrink-0 text-sm text-faint">{meta}</span>}
		</div>
	);
}

function ScoreRing({ score, verdict }: { score: number; verdict: Verdict }) {
	const r = 15;
	const length = 2 * Math.PI * r;
	return (
		<span
			role="img"
			aria-label={`ICP match ${score} out of 100`}
			className="relative grid size-10 shrink-0 place-items-center"
		>
			<svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
				<circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-soft" />
				<circle
					cx="18"
					cy="18"
					r={r}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={`${(score / 100) * length} ${length}`}
					className={VERDICT[verdict].ring}
				/>
			</svg>
			<span className="tb-num text-sm font-semibold text-ink">{score}</span>
		</span>
	);
}

const list = (items: string[]) => items.join(', ');

/** The answer itself, shaped by the question type. `null` reads as "Not on the profile". */
export function AnswerValue({ field, value }: { field: Field; value: unknown }) {
	const unknown = <span className="text-faint">Not on the profile</span>;
	if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return unknown;
	switch (field.type) {
		case 'yesno':
			return <Badge tone={value ? 'ok' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>;
		case 'score': {
			const min = field.min ?? 1;
			const max = field.max ?? 10;
			const share = Math.min(1, Math.max(0, (Number(value) - min) / (max - min || 1)));
			return (
				<span className="inline-flex items-center gap-2">
					<span className="tb-num font-medium text-ink">
						{String(value)}
						<span className="font-normal text-faint">/{max}</span>
					</span>
					<span className="h-1 w-12 overflow-hidden rounded-full bg-soft" aria-hidden="true">
						<span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(6, share * 100)}%` }} />
					</span>
				</span>
			);
		}
		case 'multi':
		case 'list':
			return Array.isArray(value) ? <span className="wrap-anywhere">{list(value.map(String))}</span> : unknown;
		case 'choice':
			return <Badge tone="accent">{String(value)}</Badge>;
		case 'number':
			return <span className="tb-num font-medium">{String(value)}</span>;
		default:
			return <span className="whitespace-pre-wrap wrap-anywhere">{String(value)}</span>;
	}
}

const CONFIDENCE: Record<Confidence, { label: string; dot: 'ok' | 'warn' | 'idle' }> = {
	high: { label: 'High', dot: 'ok' },
	medium: { label: 'Medium', dot: 'warn' },
	low: { label: 'Low', dot: 'idle' }
};

/** "High", "Medium", "Low" with a dot: how sure the answer is. */
function ConfidenceMark({ confidence }: { confidence: Confidence }) {
	const c = CONFIDENCE[confidence] ?? CONFIDENCE.low;
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-xs text-faint">
			<StatusDot tone={c.dot} />
			{c.label}
			<span className="sr-only"> confidence</span>
		</span>
	);
}

function AnswerRow({ field, answer }: { field: Field; answer?: Answer }) {
	const evidence = answer?.evidence?.trim();
	const quotes = answer?.quotes ?? [];
	const label = <span className="min-w-0 wrap-anywhere">{field.label}</span>;
	const value = (
		<dd className="grid min-w-0 gap-0.5 text-base text-ink">
			<span className="flex min-w-0 items-baseline justify-between gap-2">
				<span className="min-w-0">
					<AnswerValue field={field} value={answer?.value} />
				</span>
				{answer && <ConfidenceMark confidence={answer.confidence} />}
			</span>
			{answer?.confidence === 'low' && answer.missing && (
				<span className="text-sm text-faint">Missing: {answer.missing.replace(/^missing:\s*/i, '')}</span>
			)}
		</dd>
	);
	if (!evidence && !quotes.length)
		return (
			<div className="grid grid-cols-2 items-baseline gap-3 px-3 py-1.5">
				<dt className="pl-5 text-sm text-muted">{label}</dt>
				{value}
			</div>
		);
	return (
		<Collapsible className="group px-3 py-1.5">
			<div className="grid grid-cols-2 items-baseline gap-3">
				<dt className="min-w-0 text-sm text-muted">
					<CollapsibleTrigger className="flex min-w-0 items-baseline gap-1 rounded-xs text-left hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
						<ChevronRight
							size={14}
							aria-hidden="true"
							className="shrink-0 translate-y-0.5 text-faint transition-transform group-data-[state=open]:rotate-90"
						/>
						{label}
						<span className="sr-only">, show evidence</span>
					</CollapsibleTrigger>
				</dt>
				{value}
			</div>
			<CollapsibleContent className="mt-1 ml-5 grid gap-1 text-sm text-muted">
				{evidence && <p className="min-w-0 wrap-anywhere">{evidence}</p>}
				{quotes.map((q) => (
					<blockquote key={q} className="min-w-0 border-l-2 border-line pl-2 wrap-anywhere text-ink">
						“{q}”
					</blockquote>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-2 items-baseline gap-3 px-3 py-1.5">
			<dt className="text-sm text-muted">{label}</dt>
			<dd className="min-w-0 text-base wrap-anywhere text-ink">{children}</dd>
		</div>
	);
}

/** The person at a glance: the model's two or three lines, then facts computed in code as badges. */
function Summary({ analysis, facts }: { analysis: Analysis; facts?: ComputedFacts }) {
	const months = facts?.experienceMonths ?? null;
	const years = analysis.facts.yearsOfExperience;
	const company = facts?.currentCompany ?? analysis.facts.currentCompany;
	const location = facts?.location ?? analysis.facts.location;
	const skills = (facts?.topSkills.length ? facts.topSkills : (analysis.facts.topSkills ?? [])).slice(0, 4);
	const seniority = analysis.facts.seniority;
	const icon = 'size-3';
	return (
		<div className="grid gap-2">
			{analysis.summary && <p className="text-base leading-snug text-ink">{analysis.summary}</p>}
			<ul aria-label="Quick facts" className="flex flex-wrap gap-1">
				{(months !== null || (years !== null && years !== undefined)) && (
					<li>
						<Badge tone="outline">
							<Briefcase className={icon} aria-hidden="true" />
							<span className="tb-num">{months !== null ? formatMonths(months) : `~${years} yrs`}</span>
							experience
						</Badge>
					</li>
				)}
				{seniority && (
					<li>
						<Badge tone="outline">{seniority.replace(/^./, (c) => c.toUpperCase())}</Badge>
					</li>
				)}
				{company && (
					<li>
						<Badge tone="outline" className="max-w-48">
							<Building2 className={icon} aria-hidden="true" />
							<span className="truncate">{company}</span>
						</Badge>
					</li>
				)}
				{location && (
					<li>
						<Badge tone="outline" className="max-w-48">
							<MapPin className={icon} aria-hidden="true" />
							<span className="truncate">{location}</span>
						</Badge>
					</li>
				)}
				{skills.map((s) => (
					<li key={s}>
						<Badge tone="neutral" className="max-w-40">
							<span className="truncate">{s}</span>
						</Badge>
					</li>
				))}
			</ul>
		</div>
	);
}

export function Results({
	set,
	analysis,
	facts: computed
}: {
	set: QuestionSet;
	analysis: Analysis;
	/** Facts computed from the profile's dates; older snapshots have none. */
	facts?: ComputedFacts;
}) {
	const { facts, icp } = analysis;
	const verdict = VERDICT[icp.verdict] ?? VERDICT.no;
	const answers = analysis.answers as Record<string, Answer | undefined>;
	const now = [facts.currentRole, facts.currentCompany].filter(Boolean).join(' at ');
	const experience = [
		computed?.experienceMonths !== null && computed?.experienceMonths !== undefined
			? formatMonths(computed.experienceMonths)
			: facts.yearsOfExperience !== null && facts.yearsOfExperience !== undefined
				? `About ${facts.yearsOfExperience} years`
				: '',
		facts.seniority ?? ''
	]
		.filter(Boolean)
		.join(' · ');
	const factRows: [string, string][] = (
		[
			['Now', now],
			['Location', facts.location ?? ''],
			['Experience', experience],
			['Companies', list(facts.companies ?? [])],
			['Education', list(facts.education ?? [])],
			['Certifications', list(facts.certifications ?? [])],
			['Top skills', list(facts.topSkills ?? [])],
			['Posts about', list(facts.postTopics ?? [])]
		] as [string, string][]
	).filter(([, v]) => v);

	return (
		<div className="grid min-w-0 gap-3">
			<Card className="grid gap-2.5">
				<Summary analysis={analysis} facts={computed} />
				<div className="h-px bg-line" aria-hidden="true" />
				<div className="flex items-center gap-3">
					<ScoreRing score={icp.score} verdict={icp.verdict} />
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<Badge tone={verdict.tone}>{verdict.label}</Badge>
						<span className="truncate text-sm text-faint">for “{set.name}”</span>
					</div>
				</div>
				{icp.reasons.length > 0 && (
					<ul className="grid list-disc gap-0.5 pl-4 text-sm text-ink marker:text-faint">
						{icp.reasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				)}
			</Card>

			{set.fields.length > 0 && (
				<Section title="Your questions" count={set.fields.length}>
					<Card list>
						<dl aria-label="Your questions" className="divide-y divide-line">
							{set.fields.map((f) => (
								<AnswerRow key={f.id} field={f} answer={answers[f.id]} />
							))}
						</dl>
					</Card>
				</Section>
			)}

			{factRows.length > 0 && (
				<Section title="Profile facts">
					<Card list>
						<dl aria-label="Profile facts" className="divide-y divide-line">
							{factRows.map(([label, value]) => (
								<FactRow key={label} label={label}>
									{value}
								</FactRow>
							))}
						</dl>
					</Card>
				</Section>
			)}
		</div>
	);
}
