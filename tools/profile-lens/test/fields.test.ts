import { describe, expect, it } from 'vitest';
import { DEFAULT_SETS, analysisSchema, cleanField, describeFields, resolveSets, valueSchema } from '../src/fields.ts';

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
});

describe('answer shapes', () => {
	it('fits each question type, with null for “the profile doesn’t say”', () => {
		const score = valueSchema({ id: 's', label: 'Seniority', type: 'score', min: 1, max: 10 });
		expect(score.safeParse(7).success).toBe(true);
		expect(score.safeParse(11).success).toBe(false);
		expect(score.safeParse(null).success).toBe(true);
		const pick = valueSchema({ id: 'c', label: 'Type', type: 'choice', options: ['SaaS', 'Agency'] });
		expect(pick.safeParse('SaaS').success).toBe(true);
		expect(pick.safeParse('Bakery').success).toBe(false);
		const many = valueSchema({ id: 'm', label: 'Areas', type: 'multi', options: ['Sales', 'Ops'] });
		expect(many.safeParse(['Sales', 'Ops']).success).toBe(true);
		expect(valueSchema({ id: 'y', label: 'Buyer?', type: 'yesno' }).safeParse(true).success).toBe(true);
		expect(valueSchema({ id: 'l', label: 'Tools', type: 'list' }).safeParse(['Figma']).success).toBe(true);
	});

	it('asks for every question by id, with its format', () => {
		const [sales] = DEFAULT_SETS;
		const shape = analysisSchema(sales!).shape.answers.shape;
		expect(Object.keys(shape)).toEqual(sales!.fields.map((f) => f.id));
		const words = describeFields(sales!);
		expect(words).toContain('[seniority] How senior are they? (score from 1 to 10)');
		expect(words).toContain('Format: One friendly sentence');
	});
});
