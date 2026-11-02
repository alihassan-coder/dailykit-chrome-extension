// Question sets: an ICP plus the questions you want answered about every profile. Each question has a
// type, and the type decides the shape of the AI's answer, so answers come back checkable and can be shown
// as a badge, a score or a list instead of a paragraph. The schema the model fills is deliberately lenient
// (numbers are numbers, options are strings); `normalizeAnalysis` then rounds, clamps and snaps in code, so
// one 7.5 or an unlisted option never fails the whole analysis.
import { z } from 'zod';

export const FIELD_TYPES = {
	text: { label: 'Text answer', hint: 'A short written answer' },
	yesno: { label: 'Yes / No', hint: 'Yes, no, or not enough to tell' },
	score: { label: 'Score', hint: 'A number on a scale you set, like 1–10' },
	choice: { label: 'Pick one', hint: 'One option from your list' },
	multi: { label: 'Pick several', hint: 'Any options from your list' },
	number: { label: 'Number', hint: 'A number, like years of experience' },
	list: { label: 'List', hint: 'A list of short items, like tools they use' },
	custom: { label: 'Custom format', hint: 'Describe the answer you want in your own words' }
} as const;

export type FieldType = keyof typeof FIELD_TYPES;

export interface Field {
	id: string;
	/** The question, as you would ask a colleague. */
	label: string;
	type: FieldType;
	/** Options for "Pick one" and "Pick several". */
	options?: string[];
	/** Range for "Score". */
	min?: number;
	max?: number;
	/** Extra guidance; for "Custom format", the format itself. */
	instructions?: string;
}

export interface QuestionSet {
	id: string;
	name: string;
	/** Who you are looking for, in plain words. The AI scores every profile against it. */
	icp: string;
	fields: Field[];
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_SETS: QuestionSet[] = [
	{
		id: 'sales-lead',
		name: 'Sales lead',
		icp: 'Founders, CEOs and heads of growth or sales at B2B software companies with 10–200 people, who post about growth, sales or hiring.',
		fields: [
			{ id: 'decision-maker', label: 'Can this person decide to buy?', type: 'yesno' },
			{ id: 'seniority', label: 'How senior are they?', type: 'score', min: 1, max: 10 },
			{
				id: 'company-type',
				label: 'What kind of company do they work at now?',
				type: 'choice',
				options: ['SaaS', 'Agency', 'E-commerce', 'Enterprise', 'Other']
			},
			{ id: 'pains', label: 'What problems are they likely dealing with?', type: 'list' },
			{
				id: 'opener',
				label: 'Opening line for a message',
				type: 'custom',
				instructions: 'One friendly sentence that mentions something specific from their profile or posts. No flattery.'
			}
		]
	},
	{
		id: 'hiring',
		name: 'Hiring a developer',
		icp: 'Software engineers with 4+ years of TypeScript or React, who have shipped products and work well remotely.',
		fields: [
			{ id: 'years', label: 'Years of professional experience', type: 'number' },
			{ id: 'stack', label: 'Languages and tools they use', type: 'list' },
			{ id: 'open', label: 'Do they look open to new roles?', type: 'yesno' },
			{ id: 'fit', label: 'How well do they fit the role?', type: 'score', min: 1, max: 10 }
		]
	}
];

/** Options must be unique and non-empty; ranges must make sense. Fixes what it can, drops what it can't. */
export function cleanField(raw: unknown): Field | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const f = raw as Partial<Field>;
	if (typeof f.label !== 'string' || !f.label.trim() || !(String(f.type) in FIELD_TYPES)) return null;
	const field: Field = { id: typeof f.id === 'string' && f.id ? f.id : newId(), label: f.label, type: f.type! };
	if (field.type === 'choice' || field.type === 'multi') {
		field.options = [...new Set((f.options ?? []).map((o) => String(o).trim()).filter(Boolean))];
		if (!field.options.length) return null;
	}
	if (field.type === 'score') {
		field.min = Number.isFinite(f.min) ? Math.round(f.min!) : 1;
		field.max = Number.isFinite(f.max) && f.max! > field.min ? Math.round(f.max!) : field.min + 9;
	}
	if (typeof f.instructions === 'string' && f.instructions.trim()) field.instructions = f.instructions.trim();
	return field;
}

/** Whatever is saved, turned into valid question sets (the defaults when there are none). */
export function resolveSets(raw: unknown): QuestionSet[] {
	if (!Array.isArray(raw)) return DEFAULT_SETS;
	const sets = raw.flatMap((s): QuestionSet[] => {
		if (typeof s !== 'object' || s === null || typeof s.name !== 'string') return [];
		const fields = Array.isArray(s.fields) ? s.fields.map(cleanField).filter((f: Field | null) => f !== null) : [];
		return [{ id: typeof s.id === 'string' ? s.id : newId(), name: s.name, icp: String(s.icp ?? ''), fields }];
	});
	return sets.length ? sets : DEFAULT_SETS;
}

/** A problem that would make a set fail or mislead the AI. */
export type SetIssue = { fieldId?: string; message: string };

/** Empty when the set is ready to use. Checked before analysing and before the editor saves. */
export function validateSet(set: QuestionSet): SetIssue[] {
	const issues: SetIssue[] = [];
	if (!set.name.trim()) issues.push({ message: 'Give the set a name.' });
	for (const f of set.fields) {
		const at = (message: string) => issues.push({ fieldId: f.id, message });
		if (!f.label.trim()) at('Write the question.');
		if ((f.type === 'choice' || f.type === 'multi') && !(f.options ?? []).some((o) => o.trim()))
			at('Add at least one option.');
		if (f.type === 'score') {
			const min = f.min ?? 1;
			const max = f.max ?? 10;
			if (!Number.isFinite(min) || !Number.isFinite(max)) at('Enter both ends of the range.');
			else if (min >= max) at('The lowest score must be below the highest.');
		}
	}
	return issues;
}

/** The answer's shape for one question, as the model is asked to give it. `null` means "the profile doesn't say". */
export function valueSchema(field: Field) {
	switch (field.type) {
		case 'text':
		case 'custom':
		case 'choice':
			return z.string().nullable();
		case 'yesno':
			return z.boolean().nullable();
		case 'score':
		case 'number':
			return z.number().nullable();
		case 'multi':
		case 'list':
			return z.array(z.string());
	}
}

export const SENIORITY = ['entry', 'mid', 'senior', 'lead', 'executive', 'founder'] as const;
export const VERDICTS = ['strong', 'possible', 'weak', 'no'] as const;
export type Verdict = (typeof VERDICTS)[number];
export type Confidence = 'high' | 'medium' | 'low';

/** The facts every analysis pulls out, whatever the questions are. */
const FACTS = z.object({
	headline: z.string().describe('Their headline as written on the profile'),
	location: z.string().nullable(),
	currentRole: z.string().nullable(),
	currentCompany: z.string().nullable(),
	yearsOfExperience: z.number().nullable().describe('Total professional years, estimated from the experience dates'),
	seniority: z
		.string()
		.nullable()
		.describe(`One of: ${SENIORITY.join(', ')}; null if unclear`),
	companies: z.array(z.string()).describe('Past and present employers, most recent first'),
	education: z.array(z.string()),
	certifications: z.array(z.string()),
	topSkills: z.array(z.string()).describe('Up to 10'),
	postTopics: z.array(z.string()).describe('What their recent posts are about; empty if no posts were read')
});

/** The lenient schema the model fills in. Its output always goes through `normalizeAnalysis`. */
export function analysisSchema(set: QuestionSet) {
	const answers = Object.fromEntries(
		set.fields.map((f) => [
			f.id,
			z.object({
				value: valueSchema(f),
				evidence: z.string().describe('What on the profile supports this, briefly; empty when value is null'),
				confidence: z.string().describe('high, medium or low')
			})
		])
	);
	return z.object({
		facts: FACTS,
		icp: z.object({
			score: z.number().describe('How well this person matches the ICP, a whole number 0–100'),
			reasons: z.array(z.string()).describe('2–4 short reasons, for and against')
		}),
		answers: z.object(answers),
		summary: z.string().describe('Two or three sentences on who this person is, for the user')
	});
}

export interface Facts {
	headline: string;
	location: string | null;
	currentRole: string | null;
	currentCompany: string | null;
	yearsOfExperience: number | null;
	seniority: (typeof SENIORITY)[number] | null;
	companies: string[];
	education: string[];
	certifications: string[];
	topSkills: string[];
	postTopics: string[];
}

export type Answer = { value: unknown; evidence: string; confidence: Confidence };

export interface Analysis {
	facts: Facts;
	icp: { score: number; verdict: Verdict; reasons: string[] };
	answers: Record<string, Answer>;
	summary: string;
}

/** The verdict follows the score, so the two never disagree. Matches the rubric in the prompt. */
export function verdictFor(score: number): Verdict {
	return score >= 75 ? 'strong' : score >= 50 ? 'possible' : score >= 25 ? 'weak' : 'no';
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const norm = (s: string) => s.trim().toLowerCase();
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The listed option closest to what the model wrote: the same words in any case, or one inside the other. */
export function snapOption<T extends string>(options: readonly T[], raw: unknown): T | null {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const v = norm(raw);
	return options.find((o) => norm(o) === v) ?? options.find((o) => v.includes(norm(o)) || norm(o).includes(v)) ?? null;
}

/** One answer in its question's shape: scores rounded and clamped, options snapped, anything else null. */
export function normalizeValue(field: Field, value: unknown): unknown {
	const num = finite(value);
	const strings = Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim())
		: [];
	switch (field.type) {
		case 'text':
		case 'custom':
			return typeof value === 'string' && value.trim() ? value.trim() : null;
		case 'yesno':
			return typeof value === 'boolean' ? value : null;
		case 'score':
			return num === null ? null : clamp(Math.round(num), field.min ?? 1, field.max ?? 10);
		case 'number':
			return num;
		case 'choice':
			return snapOption(field.options ?? [], value);
		case 'multi':
			return [...new Set(strings.map((s) => snapOption(field.options ?? [], s)).filter((s) => s !== null))];
		case 'list':
			return [...new Set(strings)];
	}
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strOrNull = (v: unknown) => str(v) || null;
const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : []);
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

/** Turns the model's lenient output into a checked Analysis for this set. Never throws. */
export function normalizeAnalysis(raw: unknown, set: QuestionSet): Analysis {
	const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
	const facts = r.facts ?? {};
	const icp = r.icp ?? {};
	const rawAnswers = r.answers ?? {};
	const years = finite(facts.yearsOfExperience);
	const score = clamp(Math.round(finite(icp.score) ?? 0), 0, 100);
	const answers: Record<string, Answer> = {};
	for (const f of set.fields) {
		const a = (rawAnswers[f.id] ?? {}) as Record<string, unknown>;
		const value = normalizeValue(f, a.value);
		const empty = value === null || (Array.isArray(value) && value.length === 0);
		answers[f.id] = {
			value,
			evidence: empty ? '' : str(a.evidence),
			confidence: empty ? 'low' : (snapOption(CONFIDENCES, a.confidence) ?? 'low')
		};
	}
	return {
		facts: {
			headline: str(facts.headline),
			location: strOrNull(facts.location),
			currentRole: strOrNull(facts.currentRole),
			currentCompany: strOrNull(facts.currentCompany),
			yearsOfExperience: years === null ? null : Math.max(0, Math.round(years)),
			seniority: snapOption(SENIORITY, facts.seniority),
			companies: strList(facts.companies),
			education: strList(facts.education),
			certifications: strList(facts.certifications),
			topSkills: strList(facts.topSkills).slice(0, 10),
			postTopics: strList(facts.postTopics)
		},
		icp: { score, verdict: verdictFor(score), reasons: strList(icp.reasons) },
		answers,
		summary: str(r.summary)
	};
}

/** How each question should be answered, in words, for the prompt. */
export function describeFields(set: QuestionSet): string {
	return set.fields
		.map((f) => {
			const how =
				f.type === 'score'
					? `whole-number score from ${f.min} to ${f.max}`
					: f.type === 'choice' || f.type === 'multi'
						? `${FIELD_TYPES[f.type].label.toLowerCase()}, written exactly as listed, of: ${f.options!.join(', ')}`
						: FIELD_TYPES[f.type].hint.toLowerCase();
			return `- [${f.id}] ${f.label} (${how})${f.instructions ? `. Format: ${f.instructions}` : ''}`;
		})
		.join('\n');
}
