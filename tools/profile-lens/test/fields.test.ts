import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETS,
	analysisSchema,
	cleanField,
	describeFields,
	normalizeValue,
	resolveSets,
	validateSet,
	valueSchema,
	verdictFor,
	type QuestionSet
} from '../src/fields.ts';

describe('question sets', () => {
	it('starts with ready-made sets, and keeps saved ones', () => {
		expect(resolveSets(undefined)).toBe(DEFAULT_SETS);
		const mine = [
			{ id: 'a', name: 'Partners', icp: 'Agencies', fields: [{ id: 'q', label: 'Size?', type: 'number' }] }
		];
		expect(resolveSets(mine)).toEqual(mine);
	});

	it('repairs or drops broken questions', () => {
		expect(cleanField({ label: 'Pick', type: 'choice', options: [' A ', 'A', ''] })?.options).toEqual(['A']);
		expect(cleanField({ label: 'Pick', type: 'choice', options: [] })).toBeNull();
		expect(cleanField({ label: 'Rate', type: 'score', min: 5, max: 2 })).toMatchObject({ min: 5, max: 14 });
		expect(cleanField({ label: '', type: 'text' })).toBeNull();
		expect(cleanField({ label: 'Odd', type: 'emoji' })).toBeNull();
	});

	it('says what is wrong with a set before it is used', () => {
		expect(DEFAULT_SETS.every((s) => validateSet(s).length === 0)).toBe(true);
		const broken: QuestionSet = {
			id: 'b',
			name: ' ',
			icp: '',
			fields: [
				{ id: 'c', label: 'Type?', type: 'choice', options: [] },
				{ id: 's', label: 'Rate', type: 'score', min: 5, max: 5 },
				{ id: 'n', label: 'Range', type: 'score', min: NaN, max: 10 },
				{ id: 'e', label: '', type: 'text' }
			]
		};
		expect(validateSet(broken)).toEqual([
			{ message: 'Give the set a name.' },
			{ fieldId: 'c', message: 'Add at least one option.' },
			{ fieldId: 's', message: 'The lowest score must be below the highest.' },
			{ fieldId: 'n', message: 'Enter both ends of the range.' },
			{ fieldId: 'e', message: 'Write the question.' }
		]);
	});
});

describe('answer shapes', () => {
	it('asks leniently: numbers as numbers and options as text, with null for “the profile doesn’t say”', () => {
		const score = valueSchema({ id: 's', label: 'Seniority', type: 'score', min: 1, max: 10 });
		expect(score.safeParse(7.5).success).toBe(true);
		expect(score.safeParse(null).success).toBe(true);
		expect(score.safeParse('7').success).toBe(false);
		const pick = valueSchema({ id: 'c', label: 'Type', type: 'choice', options: ['SaaS', 'Agency'] });
		expect(pick.safeParse('Bakery').success).toBe(true);
		expect(valueSchema({ id: 'y', label: 'Buyer?', type: 'yesno' }).safeParse(true).success).toBe(true);
		expect(valueSchema({ id: 'l', label: 'Tools', type: 'list' }).safeParse(['Figma']).success).toBe(true);
	});

	it('clamps, rounds and snaps in code', () => {
		const score = { id: 's', label: 'Seniority', type: 'score', min: 1, max: 10 } as const;
		expect(normalizeValue(score, 7.5)).toBe(8);
		expect(normalizeValue(score, 11)).toBe(10);
		expect(normalizeValue(score, -3)).toBe(1);
		expect(normalizeValue(score, 'high')).toBeNull();
		const pick = { id: 'c', label: 'Type', type: 'choice', options: ['SaaS', 'Agency', 'E-commerce'] } as const;
		expect(normalizeValue({ ...pick, options: [...pick.options] }, 'saas')).toBe('SaaS');
		expect(normalizeValue({ ...pick, options: [...pick.options] }, 'B2B SaaS')).toBe('SaaS');
		expect(normalizeValue({ ...pick, options: [...pick.options] }, 'Bakery')).toBeNull();
		const many = { id: 'm', label: 'Areas', type: 'multi', options: ['Sales', 'Ops'] } as const;
		expect(normalizeValue({ ...many, options: [...many.options] }, ['sales', 'Cooking', 'Sales'])).toEqual(['Sales']);
		expect(normalizeValue({ id: 'y', label: 'Buyer?', type: 'yesno' }, 'yes')).toBeNull();
	});

	it('derives the verdict from the score', () => {
		expect([90, 75, 74, 50, 49, 25, 24, 0].map(verdictFor)).toEqual([
			'strong',
			'strong',
			'possible',
			'possible',
			'weak',
			'weak',
			'no',
			'no'
		]);
	});

	it('asks for every question by id, with its format', () => {
		const [sales] = DEFAULT_SETS;
		const shape = analysisSchema(sales!).shape.answers.shape;
		expect(Object.keys(shape)).toEqual(sales!.fields.map((f) => f.id));
		const words = describeFields(sales!);
		expect(words).toContain('[seniority] How senior are they? (whole-number score from 1 to 10)');
		expect(words).toContain('Format: One friendly sentence');
	});
});
