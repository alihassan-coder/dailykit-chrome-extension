// Question sets: an ICP plus the questions you want answered about every profile. Each question has a
// type, and the type decides the shape of the AI's answer (a schema), so answers come back checkable
// and can be shown as a badge, a score bar or a list instead of a paragraph.
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

/** The answer's shape for one question. `null` always means "the profile doesn't say". */
export function valueSchema(field: Field) {
	switch (field.type) {
		case 'text':
		case 'custom':
			return z.string().nullable();
		case 'yesno':
			return z.boolean().nullable();
		case 'score':
			return z
				.number()
				.int()
				.min(field.min ?? 1)
				.max(field.max ?? 10)
				.nullable();
		case 'number':
			return z.number().nullable();
		case 'choice':
			return z.enum(field.options as [string, ...string[]]).nullable();
		case 'multi':
			return z.array(z.enum(field.options as [string, ...string[]]));
		case 'list':
			return z.array(z.string());
	}
}

const CONFIDENCE = z.enum(['high', 'medium', 'low']);

/** The facts every analysis pulls out, whatever the questions are. */
const FACTS = z.object({
	headline: z.string().describe('Their headline as written on the profile'),
	location: z.string().nullable(),
	currentRole: z.string().nullable(),
	currentCompany: z.string().nullable(),
	yearsOfExperience: z.number().nullable().describe('Total professional years, estimated from the experience dates'),
	seniority: z.enum(['entry', 'mid', 'senior', 'lead', 'executive', 'founder']).nullable(),
	companies: z.array(z.string()).describe('Past and present employers, most recent first'),
	education: z.array(z.string()),
	certifications: z.array(z.string()),
	topSkills: z.array(z.string()).describe('Up to 10'),
	postTopics: z.array(z.string()).describe('What their recent posts are about; empty if no posts were read')
});

export function analysisSchema(set: QuestionSet) {
	const answers = Object.fromEntries(
		set.fields.map((f) => [
			f.id,
			z.object({
				value: valueSchema(f),
				evidence: z.string().describe('What on the profile supports this, quoted or paraphrased briefly'),
				confidence: CONFIDENCE
			})
		])
	);
	return z.object({
		facts: FACTS,
		icp: z.object({
			score: z.number().int().min(0).max(100).describe('How well this person matches the ICP, 0–100'),
			verdict: z.enum(['strong', 'possible', 'weak', 'no']),
			reasons: z.array(z.string()).describe('2–4 short reasons, for and against')
		}),
		answers: z.object(answers),
		summary: z.string().describe('Two or three sentences on who this person is, for the user')
	});
}

export type Analysis = z.infer<ReturnType<typeof analysisSchema>>;
export type Answer = { value: unknown; evidence: string; confidence: 'high' | 'medium' | 'low' };

/** How each question should be answered, in words, for the prompt. */
export function describeFields(set: QuestionSet): string {
	return set.fields
		.map((f) => {
			const how =
				f.type === 'score'
					? `score from ${f.min} to ${f.max}`
					: f.type === 'choice' || f.type === 'multi'
						? `${FIELD_TYPES[f.type].label.toLowerCase()} of: ${f.options!.join(', ')}`
						: FIELD_TYPES[f.type].hint.toLowerCase();
			return `- [${f.id}] ${f.label} (${how})${f.instructions ? `. Format: ${f.instructions}` : ''}`;
		})
		.join('\n');
}
