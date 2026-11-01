// One analysed profile: who it is, how well they match your ICP, and the answer to each of your questions,
// drawn to suit the question (a badge for yes/no, a bar for a score, chips for picks and lists).
import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Analysis, Answer, Field, QuestionSet } from './fields.ts';
import type { ProfileSnapshot } from './profile.ts';

const VERDICT = {
	strong: { label: 'Strong match', className: 'bg-ok/15 text-ok' },
	possible: { label: 'Possible match', className: 'bg-accent-soft text-accent' },
	weak: { label: 'Weak match', className: 'bg-warn/15 text-warn' },
	no: { label: 'Not a match', className: 'bg-soft text-muted' }
} as const;

const CONFIDENCE = { high: 'bg-ok', medium: 'bg-warn', low: 'bg-line' } as const;

function Chips({ items }: { items: string[] }) {
	if (!items.length) return <span className="text-muted">—</span>;
	return (
		<span className="flex flex-wrap gap-1">
			{items.map((i) => (
				<span key={i} className="rounded-full bg-soft px-2 py-0.5 text-sm">
					{i}
				</span>
			))}
		</span>
	);
}

/** The answer itself, shaped by the question type. `null` reads as "Not on the profile". */
export function AnswerValue({ field, value }: { field: Field; value: unknown }) {
	const unknown = <span className="text-muted">Not on the profile</span>;
	if (value === null || value === undefined) return unknown;
	switch (field.type) {
		case 'yesno':
			return (
				<span
					className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${value ? 'bg-ok/15 text-ok' : 'bg-soft text-muted'}`}
				>
					{value ? 'Yes' : 'No'}
				</span>
			);
		case 'score': {
			const min = field.min ?? 1;
			const max = field.max ?? 10;
			const share = (Number(value) - min) / (max - min || 1);
			return (
				<span className="flex items-center gap-2">
					<span className="h-1.5 w-24 overflow-hidden rounded-full bg-soft" aria-hidden="true">
						<span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, share * 100)}%` }} />
					</span>
					<span className="font-semibold tabular-nums">
						{String(value)}
						<span className="font-normal text-muted">/{max}</span>
					</span>
				</span>
			);
		}
		case 'multi':
		case 'list':
			return Array.isArray(value) ? <Chips items={value.map(String)} /> : unknown;
		case 'choice':
			return <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm text-accent">{String(value)}</span>;
		case 'number':
			return <span className="font-semibold tabular-nums">{String(value)}</span>;
		default:
			return <span className="whitespace-pre-wrap">{String(value)}</span>;
	}
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid gap-0.5">
			<dt className="text-xs text-muted">{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}

export function Results({
	profile,
	set,
	analysis
}: {
	profile: ProfileSnapshot;
	set: QuestionSet;
	analysis: Analysis;
}) {
	const { facts, icp } = analysis;
	const verdict = VERDICT[icp.verdict];
	const answers = analysis.answers as Record<string, Answer | undefined>;

	return (
		<div className="grid gap-3">
			<section className="grid gap-3 rounded-xl border border-line bg-surface p-3">
				<div className="flex items-start gap-3">
					{profile.photo ? (
						<img src={profile.photo} alt="" className="size-12 shrink-0 rounded-full bg-soft object-cover" />
					) : (
						<span className="grid size-12 shrink-0 place-items-center rounded-full bg-soft text-lg font-semibold text-muted">
							{profile.name.slice(0, 1)}
						</span>
					)}
					<div className="min-w-0 flex-1">
						<a href={profile.url} target="_blank" rel="noreferrer" className="text-lg font-semibold hover:underline">
							{profile.name}
						</a>
						<p className="text-sm text-muted">{facts.headline}</p>
						<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
							{facts.location && <span>{facts.location}</span>}
							{profile.connections && (
								<span className="flex items-center gap-1">
									<Users size={12} /> {profile.connections} connections
								</span>
							)}
							{profile.followers && <span>{profile.followers} followers</span>}
						</p>
					</div>
				</div>

				<div className="grid gap-2 rounded-lg bg-soft p-2.5">
					<div className="flex items-center gap-3">
						<span className="text-2xl font-semibold tabular-nums" aria-label={`ICP match ${icp.score} out of 100`}>
							{icp.score}
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdict.className}`}>
									{verdict.label}
								</span>
								<span className="truncate text-xs text-muted">for “{set.name}”</span>
							</div>
							<span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
								<span className="block h-full rounded-full bg-accent" style={{ width: `${icp.score}%` }} />
							</span>
						</div>
					</div>
					<ul className="grid gap-0.5 text-sm">
						{icp.reasons.map((r) => (
							<li key={r} className="flex gap-1.5">
								<span aria-hidden="true" className="text-muted">
									·
								</span>
								{r}
							</li>
						))}
					</ul>
				</div>

				<p className="text-sm">{analysis.summary}</p>
			</section>

			{set.fields.length > 0 && (
				<section aria-label="Your questions" className="rounded-xl border border-line bg-surface">
					{set.fields.map((f) => {
						const a = answers[f.id];
						return (
							<div key={f.id} className="grid gap-1 border-t border-line p-3 first:border-t-0">
								<p className="text-sm font-medium">{f.label}</p>
								<AnswerValue field={f} value={a?.value} />
								{a?.evidence && (
									<p className="flex items-start gap-1.5 text-xs text-muted">
										<span
											className={`mt-1 size-1.5 shrink-0 rounded-full ${CONFIDENCE[a.confidence]}`}
											title={`${a.confidence} confidence`}
											aria-label={`${a.confidence} confidence`}
										/>
										{a.evidence}
									</p>
								)}
							</div>
						);
					})}
				</section>
			)}

			<section aria-label="Profile facts" className="rounded-xl border border-line bg-surface p-3">
				<dl className="grid gap-3 @md:grid-cols-2">
					<Fact label="Now">
						{[facts.currentRole, facts.currentCompany].filter(Boolean).join(' at ') || (
							<span className="text-muted">—</span>
						)}
					</Fact>
					<Fact label="Experience">
						{facts.yearsOfExperience !== null ? `About ${facts.yearsOfExperience} years` : '—'}
						{facts.seniority && <span className="text-muted"> · {facts.seniority}</span>}
					</Fact>
					<Fact label="Companies">
						<Chips items={facts.companies} />
					</Fact>
					<Fact label="Education">
						<Chips items={facts.education} />
					</Fact>
					<Fact label="Certifications">
						<Chips items={facts.certifications} />
					</Fact>
					<Fact label="Top skills">
						<Chips items={facts.topSkills} />
					</Fact>
					{facts.postTopics.length > 0 && (
						<Fact label="Posts about">
							<Chips items={facts.postTopics} />
						</Fact>
					)}
				</dl>
			</section>
		</div>
	);
}
