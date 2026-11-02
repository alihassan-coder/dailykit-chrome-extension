// The profile as structured facts: name, headline, roles with dates, schools, skills. LinkedIn already embeds
// most of it in the page it sends (JSON in <code> elements when you're signed in, and a schema.org Person in
// <script type="application/ld+json">), so we parse that first, passively, from the HTML we already captured:
// no extra requests, and never LinkedIn's internal API. The visible page fills in whatever the JSON lacks.
// Dates are parsed here, so "years of experience" is computed in code instead of guessed by the model.

export interface YearMonth {
	year: number;
	/** 1–12; missing when LinkedIn shows only the year. */
	month?: number;
}

export interface Position {
	title: string;
	company?: string;
	/** "Full-time", "Contract"... */
	employmentType?: string;
	start?: YearMonth;
	/** Missing with `current` for "Present". */
	end?: YearMonth;
	current?: boolean;
	/** As LinkedIn wrote it, e.g. "3 yrs 2 mos". */
	duration?: string;
	months?: number;
	location?: string;
	description?: string;
}

export interface School {
	school: string;
	degree?: string;
	start?: YearMonth;
	end?: YearMonth;
}

export type Source = 'embedded' | 'ld-json' | 'page';

export interface StructuredProfile {
	name?: string;
	headline?: string;
	location?: string;
	about?: string;
	experience: Position[];
	education: School[];
	skills: string[];
	certifications: string[];
	/** Where each part came from, for the AI and for debugging. */
	sources: Partial<Record<'profile' | 'experience' | 'education' | 'skills' | 'certifications', Source>>;
}

export const emptyStructured = (): StructuredProfile => ({
	experience: [],
	education: [],
	skills: [],
	certifications: [],
	sources: {}
});

// ---------------------------------------------------------------------------------------------------------
// Text

/** One line of LinkedIn text: whitespace collapsed, and a screen-reader double ("Head of GrowthHead of Growth") removed. */
export function cleanLine(raw: string): string {
	// The "…see more" button reads as part of the line it expands.
	const t = raw
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\s*(…|\.\.\.)\s*(see\s+)?more$/i, '');
	if (t.length >= 4) {
		const half = t.length / 2;
		if (Number.isInteger(half) && t.slice(0, half) === t.slice(half)) return t.slice(0, half).trim();
		const words = t.split(' ');
		const w = words.length / 2;
		if (Number.isInteger(w) && w > 0 && words.slice(0, w).join(' ') === words.slice(w).join(' '))
			return words.slice(0, w).join(' ');
	}
	return t;
}

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? cleanLine(v) : undefined);
const longText = (v: unknown): string | undefined =>
	typeof v === 'string' && v.trim()
		? v
				.split('\n')
				.map((l) => l.replace(/[ \t]+/g, ' ').trim())
				.filter(Boolean)
				.join('\n')
		: undefined;

// ---------------------------------------------------------------------------------------------------------
// Dates

const MONTHS: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12
};
const MONTH = '(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+)?';
const RANGE = new RegExp(
	`^(?:issued\\s+)?${MONTH}(\\d{4})\\s*(?:[-–—]|to)\\s*(?:(present|now|current|today)|${MONTH}(\\d{4}))(?:\\s*·\\s*(.+))?$`,
	'i'
);
const SINGLE = new RegExp(`^${MONTH}(\\d{4})(?:\\s*·\\s*(.+))?$`, 'i');

/** "3 yrs 2 mos" → 38; "less than a year" → 0; anything else → undefined. */
export function parseDuration(text: string | undefined): number | undefined {
	if (!text) return undefined;
	const t = text.toLowerCase();
	if (/less than a (year|month)/.test(t)) return 0;
	const y = /(\d+)\s*(?:yrs?|years?)\b/.exec(t);
	const m = /(\d+)\s*(?:mos?|months?)\b/.exec(t);
	if (!y && !m) return undefined;
	return Number(y?.[1] ?? 0) * 12 + Number(m?.[1] ?? 0);
}

const ym = (month: string | undefined, year: string): YearMonth => {
	const m = month ? MONTHS[month.toLowerCase().slice(0, 3)] : undefined;
	return m ? { year: Number(year), month: m } : { year: Number(year) };
};

/**
 * A LinkedIn date line: "Jan 2021 - Present · 3 yrs 2 mos", "2016 – 2020", "Mar 2019". The "· 3 yrs 2 mos"
 * tail becomes `duration`/`months` instead of noise in the text. Null when the line isn't a date.
 */
export function parseDateRange(
	line: string
): { start: YearMonth; end?: YearMonth; current: boolean; duration?: string; months?: number } | null {
	const t = cleanLine(line);
	const r = RANGE.exec(t);
	if (r) {
		const [, sm, sy, present, em, ey, tail] = r;
		const duration = tail?.trim() || undefined;
		return {
			start: ym(sm, sy!),
			end: present ? undefined : ym(em, ey!),
			current: !!present,
			duration,
			months: parseDuration(duration)
		};
	}
	const s = SINGLE.exec(t);
	if (s) {
		const [, sm, sy, tail] = s;
		const duration = tail?.trim() || undefined;
		const start = ym(sm, sy!);
		return { start, end: start, current: false, duration, months: parseDuration(duration) };
	}
	return null;
}

const index = (d: YearMonth, fallbackMonth: number) => d.year * 12 + (d.month ?? fallbackMonth) - 1;

/**
 * Total professional experience in months: every role with a start date, overlaps counted once (two jobs at
 * the same time are not two years), "Present" up to `now`. Null when no role has dates.
 */
export function experienceMonths(positions: Position[], now = new Date()): number | null {
	const today = now.getFullYear() * 12 + now.getMonth();
	const spans = positions
		.filter((p) => p.start && Number.isFinite(p.start.year) && p.start.year > 1950)
		.map((p): [number, number] => {
			const start = index(p.start!, 1);
			const end = p.current || !p.end ? today : index(p.end, p.end.month ? p.end.month : 1);
			return [start, Math.min(today, Math.max(start, end)) + 1];
		})
		.sort((a, b) => a[0] - b[0]);
	if (!spans.length) return null;
	let total = 0;
	let [from, to] = spans[0]!;
	for (const [s, e] of spans.slice(1)) {
		if (s <= to) to = Math.max(to, e);
		else {
			total += to - from;
			[from, to] = [s, e];
		}
	}
	return total + (to - from);
}

/** "8 yrs", "1 yr 4 mos", "7 mos". */
export function formatMonths(months: number): string {
	const y = Math.floor(months / 12);
	const m = months % 12;
	if (!y) return `${m} mo${m === 1 ? '' : 's'}`;
	if (y >= 3 || !m) return `${y} yr${y === 1 ? '' : 's'}`;
	return `${y} yr${y === 1 ? '' : 's'} ${m} mo${m === 1 ? '' : 's'}`;
}

const formatYm = (d?: YearMonth) =>
	d
		? d.month
			? `${Object.keys(MONTHS)[d.month - 1]!.replace(/^./, (c) => c.toUpperCase())} ${d.year}`
			: `${d.year}`
		: '';

/** One role as one plain line for the AI: "Head of Growth — Acme (Full-time) · Jan 2021 – Present · 3 yrs 2 mos · Berlin". */
export function positionLine(p: Position): string {
	const dates = p.start ? `${formatYm(p.start)} – ${p.current || !p.end ? 'Present' : formatYm(p.end)}` : '';
	return [
		[p.title, p.company && `— ${p.company}`, p.employmentType && `(${p.employmentType})`].filter(Boolean).join(' '),
		dates,
		p.duration,
		p.location
	]
		.filter(Boolean)
		.join(' · ');
}

export function schoolLine(s: School): string {
	const dates = s.start ? `${formatYm(s.start)} – ${formatYm(s.end) || 'Present'}` : '';
	return [s.school, s.degree, dates].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------------------------------------
// The visible page: list items as lines of text

const EMPLOYMENT =
	/^(full-time|part-time|self-employed|freelance|contract|internship|apprenticeship|seasonal|permanent|temporary|trainee|volunteer)$/i;
const WORKPLACE = /^(remote|hybrid|on-site|onsite)$/i;
/** Lines inside an item that are LinkedIn chrome, not content. */
const ITEM_NOISE =
	/^(…?\s*see more|see less|show all.*|show more|show less|follow|message|connect|·|•|skills?:.*|\d+ endorsements?|endorsed by .*|show credential|credential id .*|\+\d+ skills?)$/i;

const cleanItem = (lines: string[]) => {
	const out: string[] = [];
	for (const raw of lines) {
		const t = cleanLine(raw);
		if (!t || ITEM_NOISE.test(t) || t === out.at(-1)) continue;
		out.push(t);
	}
	return out;
};

const looksLikeLocation = (t: string) =>
	t.length <= 80 &&
	!/[.!?]$/.test(t) &&
	(/,/.test(t) || WORKPLACE.test(t.split(' · ').at(-1)!.trim()) || / · (remote|hybrid|on-site)$/i.test(t));

/** "Acme · Full-time" → { company: "Acme", type: "Full-time" }. */
function companyLine(t: string): { company: string; type?: string } {
	const parts = t.split(' · ').map((s) => s.trim());
	const type = parts.slice(1).find((p) => EMPLOYMENT.test(p));
	return { company: parts[0]!, type };
}

/**
 * One experience list item → its roles. Handles both shapes LinkedIn uses:
 * a single role ("Title", "Company · Full-time", "Jan 2021 - Present · 3 yrs", "Berlin", description...) and a
 * company with several roles ("Company", "Full-time · 5 yrs", then "Title", "Jan 2021 - Present", ... per role).
 */
export function parseExperienceItem(raw: string[]): Position[] {
	const lines = cleanItem(raw);
	const dateAt = lines.map((l, i) => (parseDateRange(l) ? i : -1)).filter((i) => i >= 0);
	if (!dateAt.length) return lines[0] ? [{ title: lines[0], company: lines[1] && companyLine(lines[1]).company }] : [];

	// A company header with several roles: the header's second line is a total duration, not a date.
	const grouped = dateAt.length > 1 && dateAt[0]! >= 2 && parseDuration(lines[1]?.split(' · ').at(-1)) !== undefined;
	const out: Position[] = [];
	dateAt.forEach((at, n) => {
		const range = parseDateRange(lines[at]!)!;
		const next = dateAt[n + 1] ?? lines.length;
		let title: string | undefined;
		let company: string | undefined;
		let type: string | undefined;
		if (grouped) {
			const group = companyLine(lines[0]!);
			company = group.company;
			type = lines[1]?.split(' · ').find((p) => EMPLOYMENT.test(p.trim()));
			// "Title", optional "Full-time", then the date.
			let t = at - 1;
			if (t > 0 && EMPLOYMENT.test(lines[t]!)) {
				type = lines[t];
				t--;
			}
			title = t >= 2 || (t >= 0 && n > 0) ? lines[t] : undefined;
		} else if (at >= 2) {
			title = lines[at - 2];
			({ company, type } = companyLine(lines[at - 1]!));
		} else if (at === 1) {
			title = lines[0];
		}
		if (!title) return;
		// After the date: an optional location, then the description, up to the next role's title.
		let stop = next;
		if (grouped && n + 1 < dateAt.length) stop = EMPLOYMENT.test(lines[next - 1]!) ? next - 2 : next - 1;
		const after = lines.slice(at + 1, stop);
		const location = after[0] && looksLikeLocation(after[0]) ? after.shift() : undefined;
		const description = after.filter((l) => !EMPLOYMENT.test(l)).join('\n') || undefined;
		out.push({
			title,
			company,
			employmentType: type,
			start: range.start,
			end: range.end,
			current: range.current || undefined,
			duration: range.duration,
			months: range.months,
			location,
			description: clip(description, 600)
		});
	});
	return out;
}

/** "School", "Degree, Field", "2016 - 2020". */
export function parseEducationItem(raw: string[]): School | null {
	const lines = cleanItem(raw);
	if (!lines[0]) return null;
	const dateIndex = lines.findIndex((l) => parseDateRange(l));
	const range = dateIndex >= 0 ? parseDateRange(lines[dateIndex]!) : null;
	const degree = lines[1] && dateIndex !== 1 ? lines[1] : undefined;
	return { school: lines[0], degree, start: range?.start, end: range?.current ? undefined : range?.end };
}

/** A skill item's first line is the skill; the rest is endorsements and where it was used. */
export const parseSkillItem = (raw: string[]) => cleanItem(raw)[0] ?? null;

/** "Name", "Issuer", "Issued Jan 2022". */
export function parseCertificationItem(raw: string[]): string | null {
	const lines = cleanItem(raw);
	if (!lines[0]) return null;
	const issuer = lines[1] && !/^issued/i.test(lines[1]) && !parseDateRange(lines[1]) ? lines[1] : undefined;
	return issuer ? `${lines[0]} — ${issuer}` : lines[0];
}

/** Which list a section heading is. LinkedIn's headings, in English. */
export function listKind(heading: string): 'experience' | 'education' | 'skills' | 'certifications' | null {
	const h = heading.toLowerCase();
	if (h === 'experience') return 'experience';
	if (h === 'education') return 'education';
	if (h === 'skills') return 'skills';
	if (h.startsWith('licenses') || h.startsWith('certifications')) return 'certifications';
	return null;
}

/** The visible page's lists, from section headings → items (each item = its lines). */
export function fromPage(lists: { heading: string; items: string[][] }[]): StructuredProfile {
	const out = emptyStructured();
	for (const { heading, items } of lists) {
		const kind = listKind(cleanLine(heading));
		if (!kind) continue;
		if (kind === 'experience') {
			const roles = items.flatMap(parseExperienceItem);
			if (roles.length > out.experience.length) out.experience = roles;
		} else if (kind === 'education') {
			const schools = items.map(parseEducationItem).filter((s): s is School => !!s);
			if (schools.length > out.education.length) out.education = schools;
		} else if (kind === 'skills') {
			const skills = [...new Set(items.map(parseSkillItem).filter((s): s is string => !!s))];
			if (skills.length > out.skills.length) out.skills = skills;
		} else {
			const certs = [...new Set(items.map(parseCertificationItem).filter((s): s is string => !!s))];
			if (certs.length > out.certifications.length) out.certifications = certs;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------------------
// Embedded JSON (<code> elements on signed-in pages)

type Entity = Record<string, unknown>;
const isObj = (v: unknown): v is Entity => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every entity in LinkedIn's normalised page data ({ data, included: [...] }), from all blobs. */
function entitiesOf(blobs: string[]): Entity[] {
	const out: Entity[] = [];
	for (const blob of blobs) {
		let json: unknown;
		try {
			json = JSON.parse(blob.trim());
		} catch {
			continue; // Not JSON (LinkedIn also keeps plain strings in <code>); nothing to read in it.
		}
		const roots = Array.isArray(json) ? json : [json];
		for (const root of roots) {
			if (!isObj(root)) continue;
			if (Array.isArray(root.included)) out.push(...root.included.filter(isObj));
			if (isObj(root.data)) out.push(root.data);
		}
	}
	return out;
}

const typeOf = (e: Entity) => String(e.$type ?? e._type ?? '');
const ymOf = (v: unknown): YearMonth | undefined =>
	isObj(v) && typeof v.year === 'number'
		? typeof v.month === 'number'
			? { year: v.year, month: v.month }
			: { year: v.year }
		: undefined;

function rangeOf(e: Entity) {
	const r = isObj(e.dateRange) ? e.dateRange : isObj(e.timePeriod) ? e.timePeriod : null;
	if (!r) return {};
	const start = ymOf(r.start ?? r.startDate);
	const end = ymOf(r.end ?? r.endDate);
	return { start, end, current: !!start && !end };
}

/**
 * Reads the person from LinkedIn's embedded page data. Only entities that belong to `slug`'s profile are used
 * (the same page also carries the viewer and "people also viewed"). Null when the profile isn't in the data.
 */
export function fromEmbedded(blobs: string[], slug: string): StructuredProfile | null {
	const entities = entitiesOf(blobs);
	if (!entities.length) return null;
	const byUrn = new Map<string, Entity>();
	for (const e of entities)
		if (typeof e.entityUrn === 'string') byUrn.set(e.entityUrn, { ...byUrn.get(e.entityUrn), ...e });
	const want = slug.toLowerCase();
	const profile = [...byUrn.values()].find(
		(e) =>
			typeof e.publicIdentifier === 'string' && e.publicIdentifier.toLowerCase() === want && (e.firstName || e.headline)
	);
	if (!profile) return null;
	const id =
		String(profile.entityUrn ?? '')
			.split(':')
			.at(-1) ?? '';
	const mine = (e: Entity) => !!id && typeof e.entityUrn === 'string' && e.entityUrn.includes(id) && e !== profile;
	const ref = (e: Entity, key: string) => {
		const urn = e[`*${key}`] ?? e[key];
		return typeof urn === 'string' ? byUrn.get(urn) : isObj(urn) ? urn : undefined;
	};
	const all = [...byUrn.values()].filter(mine);
	const ofType = (re: RegExp) => all.filter((e) => re.test(typeOf(e)));

	const geo = ref(profile, 'geoLocation');
	const out = emptyStructured();
	out.name = str([profile.firstName, profile.lastName].filter((x) => typeof x === 'string').join(' '));
	out.headline = str(profile.headline);
	out.location =
		str(profile.locationName) ??
		str(profile.geoLocationName) ??
		str((geo && ref(geo, 'geo'))?.defaultLocalizedName) ??
		str(geo?.defaultLocalizedName);
	out.about = clip(longText(profile.summary), 3_000);
	out.sources.profile = 'embedded';

	const ord = (e: Entity) => {
		const r = rangeOf(e);
		return r.current ? Infinity : r.end ? index(r.end, 12) : r.start ? index(r.start, 1) : -Infinity;
	};
	const positions = ofType(/\.Position$/)
		.map((e) => {
			const r = rangeOf(e);
			const company = str(e.companyName) ?? str(ref(e, 'company')?.name);
			return {
				entity: e,
				position: {
					title: str(e.title) ?? '',
					company,
					employmentType: str(ref(e, 'employmentType')?.name),
					...r,
					current: r.current || undefined,
					location: str(e.locationName) ?? str(e.geoLocationName),
					description: clip(longText(e.description), 600)
				} as Position
			};
		})
		.filter((p) => p.position.title)
		.sort((a, b) => ord(b.entity) - ord(a.entity))
		.map((p) => p.position);
	if (positions.length) {
		out.experience = positions;
		out.sources.experience = 'embedded';
	}
	const schools = ofType(/\.Education$/)
		.map((e): School | null => {
			const school = str(e.schoolName) ?? str(ref(e, 'school')?.name);
			if (!school) return null;
			const r = rangeOf(e);
			const degree = [str(e.degreeName), str(e.fieldOfStudy)].filter(Boolean).join(', ') || undefined;
			return { school, degree, start: r.start, end: r.end };
		})
		.filter((s): s is School => !!s);
	if (schools.length) {
		out.education = schools;
		out.sources.education = 'embedded';
	}
	const skills = [
		...new Set(
			ofType(/\.Skill$/)
				.map((e) => str(e.name))
				.filter((s): s is string => !!s)
		)
	];
	if (skills.length) {
		out.skills = skills;
		out.sources.skills = 'embedded';
	}
	const certs = ofType(/\.Certification$/)
		.map((e) => {
			const name = str(e.name);
			const by = str(e.authority) ?? str(ref(e, 'company')?.name);
			return name && (by ? `${name} — ${by}` : name);
		})
		.filter((s): s is string => !!s);
	if (certs.length) {
		out.certifications = [...new Set(certs)];
		out.sources.certifications = 'embedded';
	}
	return out;
}

// ---------------------------------------------------------------------------------------------------------
// schema.org Person (<script type="application/ld+json">)

function findPerson(node: unknown, depth = 0): Entity | null {
	if (depth > 4) return null;
	if (Array.isArray(node)) {
		for (const n of node) {
			const p = findPerson(n, depth + 1);
			if (p) return p;
		}
		return null;
	}
	if (!isObj(node)) return null;
	if (node['@type'] === 'Person' || (Array.isArray(node['@type']) && node['@type'].includes('Person'))) return node;
	return findPerson(node['@graph'], depth + 1) ?? findPerson(node.mainEntity, depth + 1);
}

const isoYm = (v: unknown): YearMonth | undefined => {
	const m = typeof v === 'string' ? /^(\d{4})(?:-(\d{2}))?/.exec(v) : null;
	return m ? (m[2] ? { year: Number(m[1]), month: Number(m[2]) } : { year: Number(m[1]) }) : undefined;
};
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** Reads a schema.org Person for `slug` (its url must be that profile when it has one). Null when there is none. */
export function fromLdJson(scripts: string[], slug: string): StructuredProfile | null {
	for (const script of scripts) {
		let json: unknown;
		try {
			json = JSON.parse(script.trim());
		} catch {
			continue; // A broken ld+json block; the visible page still has the facts.
		}
		const person = findPerson(json);
		if (!person) continue;
		const url = typeof person.url === 'string' ? person.url : '';
		if (url && !decodeURIComponent(url).toLowerCase().includes(`/in/${slug.toLowerCase()}`)) continue;
		const out = emptyStructured();
		out.name = str(person.name);
		const titles = asList(person.jobTitle).map(str).filter(Boolean);
		out.headline = titles[0];
		const address = asList(person.address)[0];
		if (isObj(address))
			out.location =
				[str(address.addressLocality), str(address.addressRegion), str(address.addressCountry)]
					.filter(Boolean)
					.join(', ') || undefined;
		out.about = clip(longText(person.description), 3_000);
		out.sources.profile = 'ld-json';
		const org = (o: unknown, current: boolean): Position | null => {
			if (!isObj(o)) return null;
			const company = str(o.name);
			if (!company) return null;
			const member = isObj(o.member) ? o.member : {};
			const start = isoYm(member.startDate);
			const end = isoYm(member.endDate);
			return {
				title: str(member.roleName) ?? (current ? (titles[0] ?? '') : ''),
				company,
				start,
				end,
				current: current && !end ? true : undefined,
				description: clip(longText(member.description), 600)
			};
		};
		const isSchool = (o: unknown) =>
			isObj(o) && /EducationalOrganization|CollegeOrUniversity|School/.test(String(o['@type']));
		const jobs = [
			...asList(person.worksFor).map((o) => org(o, true)),
			...asList(person.alumniOf)
				.filter((o) => !isSchool(o))
				.map((o) => org(o, false))
		].filter((p): p is Position => !!p);
		if (jobs.length) {
			out.experience = jobs;
			out.sources.experience = 'ld-json';
		}
		const schools = asList(person.alumniOf)
			.filter(isSchool)
			.map((o) => {
				const e = o as Entity;
				const member = isObj(e.member) ? e.member : {};
				return { school: str(e.name) ?? '', start: isoYm(member.startDate), end: isoYm(member.endDate) };
			})
			.filter((s) => s.school);
		if (schools.length) {
			out.education = schools;
			out.sources.education = 'ld-json';
		}
		const skills = asList(person.knowsAbout)
			.map(str)
			.filter((s): s is string => !!s);
		if (skills.length) {
			out.skills = [...new Set(skills)];
			out.sources.skills = 'ld-json';
		}
		return out;
	}
	return null;
}

// ---------------------------------------------------------------------------------------------------------
// Putting the sources together

/**
 * Structured data first, the visible page for anything it lacks. For each list the embedded JSON wins when it
 * has entries, unless the page shows clearly more (the JSON on the profile page can be a preview); schema.org
 * lists are a last resort because they carry no job titles.
 */
export function mergeStructured(
	embedded: StructuredProfile | null,
	ld: StructuredProfile | null,
	page: StructuredProfile
): StructuredProfile {
	const out = emptyStructured();
	for (const key of ['name', 'headline', 'location', 'about'] as const) {
		const value = embedded?.[key] ?? ld?.[key] ?? page[key];
		if (value) out[key] = value;
	}
	out.sources.profile = embedded?.name ? 'embedded' : ld?.name ? 'ld-json' : page.name ? 'page' : undefined;
	for (const key of ['experience', 'education', 'skills', 'certifications'] as const) {
		const e = embedded?.[key] ?? [];
		const p = page[key];
		const l = ld?.[key] ?? [];
		const [list, source]: [unknown[], Source | undefined] =
			e.length && e.length >= p.length
				? [e, 'embedded']
				: p.length
					? [p, 'page']
					: e.length
						? [e, 'embedded']
						: l.length
							? [l, 'ld-json']
							: [[], undefined];
		(out[key] as unknown[]) = list;
		if (source) out.sources[key] = source;
	}
	if (!out.sources.profile) delete out.sources.profile;
	return out;
}

/** Facts computed in code from the structured profile, shown as badges and given to the AI as ground truth. */
export interface ComputedFacts {
	experienceMonths: number | null;
	currentTitle: string | null;
	currentCompany: string | null;
	location: string | null;
	topSkills: string[];
}

export function computeFacts(s: StructuredProfile | undefined, now = new Date()): ComputedFacts {
	const experience = s?.experience ?? [];
	const current = experience.find((p) => p.current) ?? null;
	return {
		experienceMonths: experienceMonths(experience, now),
		currentTitle: current?.title || null,
		currentCompany: current?.company || null,
		location: s?.location ?? null,
		topSkills: (s?.skills ?? []).slice(0, 5)
	};
}

/** The structured profile as compact lines for the AI. */
export function structuredText(s: StructuredProfile, facts: ComputedFacts): string {
	const lines: string[] = [];
	if (s.headline) lines.push(`Headline: ${s.headline}`);
	if (s.location) lines.push(`Location: ${s.location}`);
	if (facts.experienceMonths !== null)
		lines.push(
			`Total experience (computed from the dates, overlaps counted once): ${formatMonths(facts.experienceMonths)} (${(facts.experienceMonths / 12).toFixed(1)} years)`
		);
	if (s.experience.length) lines.push('Roles, most recent first:', ...s.experience.map((p) => `- ${positionLine(p)}`));
	if (s.education.length) lines.push('Education:', ...s.education.map((e) => `- ${schoolLine(e)}`));
	if (s.skills.length) lines.push(`Skills: ${s.skills.slice(0, 40).join(', ')}`);
	if (s.certifications.length) lines.push(`Certifications: ${s.certifications.slice(0, 20).join('; ')}`);
	return lines.join('\n');
}
