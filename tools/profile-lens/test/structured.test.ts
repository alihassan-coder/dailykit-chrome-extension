import { describe, expect, it } from 'vitest';
import {
	cleanLine,
	emptyStructured,
	experienceMonths,
	formatMonths,
	fromEmbedded,
	fromLdJson,
	mergeStructured,
	parseDateRange,
	parseDuration,
	parseExperienceItem
} from '../src/structured.ts';

describe('text and dates', () => {
	it('cleans a line: whitespace, screen-reader doubles and the “see more” button', () => {
		expect(cleanLine('  Head  of Growth ')).toBe('Head of Growth');
		expect(cleanLine('Head of GrowthHead of Growth')).toBe('Head of Growth');
		expect(cleanLine('Acme · Full-time Acme · Full-time')).toBe('Acme · Full-time');
		expect(cleanLine('I build things. …see more')).toBe('I build things.');
		expect(cleanLine('Learn more')).toBe('Learn more');
	});

	it('reads LinkedIn date lines and turns the duration noise into fields', () => {
		expect(parseDateRange('Jan 2021 - Present · 3 yrs 2 mos')).toEqual({
			start: { year: 2021, month: 1 },
			end: undefined,
			current: true,
			duration: '3 yrs 2 mos',
			months: 38
		});
		expect(parseDateRange('2016 – 2020')).toMatchObject({ start: { year: 2016 }, end: { year: 2020 }, current: false });
		expect(parseDateRange('September 2019 to March 2021')).toMatchObject({
			start: { year: 2019, month: 9 },
			end: { year: 2021, month: 3 }
		});
		expect(parseDateRange('Issued Jan 2022')).toBeNull();
		expect(parseDateRange('Head of Growth')).toBeNull();
		expect(parseDuration('less than a year')).toBe(0);
		expect(parseDuration('1 yr')).toBe(12);
		expect(parseDuration('Full-time')).toBeUndefined();
	});

	it('counts experience once where roles overlap, up to today for current ones', () => {
		const now = new Date('2026-06-15');
		expect(
			experienceMonths(
				[
					{ title: 'A', start: { year: 2020, month: 1 }, end: { year: 2021, month: 12 } },
					{ title: 'B', start: { year: 2021, month: 6 }, current: true },
					{ title: 'Undated' }
				],
				now
			)
		).toBe(78);
		expect(experienceMonths([{ title: 'Undated' }], now)).toBeNull();
		expect(formatMonths(7)).toBe('7 mos');
		expect(formatMonths(16)).toBe('1 yr 4 mos');
		expect(formatMonths(138)).toBe('11 yrs');
	});
});

describe('experience items', () => {
	it('keeps the title and company apart, and leaves skills lines out of the description', () => {
		expect(
			parseExperienceItem([
				'Designer',
				'Studio Nord · Freelance',
				'Feb 2023 - Present · 1 yr 5 mos',
				'Remote',
				'Brand systems for startups.',
				'Skills: Figma · Branding'
			])
		).toEqual([
			{
				title: 'Designer',
				company: 'Studio Nord',
				employmentType: 'Freelance',
				start: { year: 2023, month: 2 },
				end: undefined,
				current: true,
				duration: '1 yr 5 mos',
				months: 17,
				location: 'Remote',
				description: 'Brand systems for startups.'
			}
		]);
	});

	it('reads an item without dates as a title and company', () => {
		expect(parseExperienceItem(['Advisor', 'Acme · Part-time'])).toEqual([{ title: 'Advisor', company: 'Acme' }]);
	});
});

describe('structured sources', () => {
	it('ignores blobs that are not JSON, and profiles that are not this person', () => {
		expect(fromEmbedded(['not json', '{"included":[]}'], 'jane')).toBeNull();
		const other = JSON.stringify({
			included: [{ $type: 'x.Profile', entityUrn: 'urn:li:fsd_profile:X', publicIdentifier: 'bob', firstName: 'Bob' }]
		});
		expect(fromEmbedded([other], 'jane')).toBeNull();
		expect(fromLdJson(['{"@type":"Person","name":"Bob","url":"https://www.linkedin.com/in/bob"}'], 'jane')).toBeNull();
		expect(fromLdJson(['{ broken'], 'jane')).toBeNull();
	});

	it('prefers embedded data, the page when it shows clearly more, and schema.org last', () => {
		const embedded = { ...emptyStructured(), name: 'Jane', experience: [{ title: 'Head of Growth' }] };
		const page = {
			...emptyStructured(),
			name: 'Jane Doe',
			location: 'Berlin',
			experience: [{ title: 'Head of Growth' }, { title: 'Lead' }],
			skills: ['Sales']
		};
		const ld = { ...emptyStructured(), education: [{ school: 'TU Berlin' }] };
		const merged = mergeStructured(embedded, ld, page);
		expect(merged).toMatchObject({
			name: 'Jane',
			location: 'Berlin',
			skills: ['Sales'],
			education: [{ school: 'TU Berlin' }]
		});
		expect(merged.experience).toHaveLength(2);
		expect(merged.sources).toEqual({ profile: 'embedded', experience: 'page', skills: 'page', education: 'ld-json' });
	});
});
