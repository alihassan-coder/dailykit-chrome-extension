// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

vi.mock('wxt/browser', () => ({ browser: fakeBrowser }));
const { createSettingsStore } = await import('@toolbelt/core');
const { SettingsProvider, localArea } = await import('@toolbelt/ui');
const { default: ProfileLensPanel } = await import('../src/panel.tsx');

const tools = [{ id: 'profile-lens', features: [{ id: 'posts', defaultOn: true }] }];
const renderPanel = () =>
	render(
		<SettingsProvider store={createSettingsStore(localArea, tools)}>
			<ProfileLensPanel />
		</SettingsProvider>
	);

/** The tab the panel looks at. */
const onTab = (url: string) =>
	vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: 7, url, status: 'complete' }] as never);
const KEYS = { 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } };

/** An analysis saved in the old shape (one per person), to check it still opens. */
const saved = (over: Record<string, unknown> = {}, record: Record<string, unknown> = {}) => ({
	'tb:profile-lens:saved:jane-doe': {
		profile: {
			slug: 'jane-doe',
			url: 'https://www.linkedin.com/in/jane-doe/',
			name: 'Jane Doe',
			photo: null,
			connections: null,
			followers: null,
			capturedAt: Date.now(),
			...over
		},
		set: { id: 's', name: 'Sales lead', icp: '', fields: [] },
		analysis: {
			facts: {
				headline: 'Founder at Acme',
				location: null,
				currentRole: null,
				currentCompany: null,
				yearsOfExperience: null,
				seniority: null,
				companies: [],
				education: [],
				certifications: [],
				topSkills: [],
				postTopics: []
			},
			icp: { score: 77, verdict: 'strong', reasons: ['Founder'] },
			answers: {},
			summary: 'Founder of Acme.'
		},
		chat: [],
		analyzedAt: Date.now(),
		...record
	}
});

/** A newer analysis: a question with confidence and quotes, follow-ups, and dates to compute experience from. */
const richer = () =>
	saved(
		{
			structured: {
				headline: 'Founder at Acme',
				location: 'Berlin, Germany',
				experience: [{ title: 'Founder', company: 'Acme', start: { year: 2019, month: 1 }, current: true }],
				education: [],
				skills: ['Sales', 'SaaS'],
				certifications: [],
				sources: { experience: 'embedded' }
			}
		},
		{
			set: {
				id: 's',
				name: 'Sales lead',
				icp: 'Founders',
				fields: [
					{ id: 'buyer', label: 'Can this person decide to buy?', type: 'yesno' },
					{ id: 'size', label: 'Team size', type: 'number' }
				]
			},
			analysis: {
				facts: {
					headline: 'Founder at Acme',
					location: 'Berlin, Germany',
					currentRole: 'Founder',
					currentCompany: 'Acme',
					yearsOfExperience: 7,
					seniority: 'founder',
					companies: ['Acme'],
					education: [],
					certifications: [],
					topSkills: ['Sales'],
					postTopics: []
				},
				icp: { score: 81, verdict: 'strong', reasons: ['Founder of a B2B company'] },
				answers: {
					buyer: { value: true, evidence: 'Founder and CEO', confidence: 'high', quotes: ['Founder at Acme'] },
					size: { value: null, evidence: '', confidence: 'low', quotes: [], missing: 'No team size on the profile' }
				},
				summary: 'Founder of Acme, selling sales software to mid-size teams.',
				followUps: ['Who are their customers?', 'Are they hiring?', 'What did they do before Acme?']
			}
		}
	);

let messages: () => Response;

beforeEach(() => {
	fakeBrowser.reset();
	messages = () => new Response('{}', { status: 500 });
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('/v1/messages')
				? messages()
				: new Response(
						JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: false })
					)
		)
	);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Profile lens panel', () => {
	it('asks for an AI key first', async () => {
		onTab('https://www.linkedin.com/in/jane/');
		renderPanel();
		expect(await screen.findByText('Connect an AI provider')).toBeTruthy();
	});

	it('waits for a LinkedIn profile, and says how to get one', async () => {
		await fakeBrowser.storage.local.set(KEYS);
		onTab('https://www.linkedin.com/feed/');
		renderPanel();
		const analyze = await screen.findByRole('button', { name: 'Analyze this profile' });
		expect((analyze as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText('Open a LinkedIn profile, then press Analyze.')).toBeTruthy();
		expect(screen.getByText('This LinkedIn page isn’t a profile')).toBeTruthy();
	});

	it('offers the people linked from a LinkedIn page that is not a profile, and recent ones', async () => {
		await fakeBrowser.storage.local.set({
			...KEYS,
			'tb:profile-lens:index': [
				{
					slug: 'sam-rivera',
					setId: 's',
					name: 'Sam Rivera',
					headline: '',
					photo: null,
					setName: 'Sales lead',
					score: 60,
					verdict: 'possible',
					analyzedAt: Date.now()
				}
			]
		});
		onTab('https://www.linkedin.com/search/results/people/?keywords=growth');
		vi.spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([
			{ result: [{ slug: 'jane-doe', name: 'Jane Doe' }] }
		] as never);
		const update = vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as never);
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Open Jane Doe’s profile' }));
		expect(update).toHaveBeenCalledWith(7, { url: 'https://www.linkedin.com/in/jane-doe/' });
		expect(screen.getByRole('button', { name: 'Open and analyze Jane Doe' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open Sam Rivera’s profile' })).toBeTruthy();
	});

	it('outside LinkedIn, says what to do and opens LinkedIn', async () => {
		await fakeBrowser.storage.local.set(KEYS);
		onTab('https://example.com/');
		const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
		renderPanel();
		fireEvent.click(await screen.findByRole('button', { name: 'Open LinkedIn' }));
		expect(create).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/feed/' });
	});

	it('asks for access to LinkedIn from a click when it is missing', async () => {
		await fakeBrowser.storage.local.set(KEYS);
		onTab('https://www.linkedin.com/in/jane-doe/');
		vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false as never);
		const request = vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(false as never);
		renderPanel();
		expect(await screen.findByText('Allow access to LinkedIn')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Allow on LinkedIn' }));
		expect(request).toHaveBeenCalledWith({ origins: ['https://www.linkedin.com/*'] });
	});

	it('on LinkedIn’s sign-in wall, says to sign in', async () => {
		await fakeBrowser.storage.local.set(KEYS);
		onTab('https://www.linkedin.com/authwall?trk=x&sessionRedirect=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fjane-doe');
		renderPanel();
		expect(await screen.findByText('Sign in to LinkedIn')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open LinkedIn' })).toBeTruthy();
	});

	it('is ready on a profile, with the starter question sets', async () => {
		await fakeBrowser.storage.local.set(KEYS);
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		const analyze = await screen.findByRole('button', { name: 'Analyze this profile' });
		expect((analyze as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByText('linkedin.com/in/jane-doe')).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Question set' }).textContent).toContain('Sales lead');
	});

	it('blocks Analyze with a note when the question set is not ready', async () => {
		await fakeBrowser.storage.local.set({
			...KEYS,
			'tb:profile-lens:sets': [{ id: 'x', name: ' ', icp: '', fields: [] }]
		});
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		const analyze = await screen.findByRole('button', { name: 'Analyze this profile' });
		expect((analyze as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/isn’t ready to use/)).toBeTruthy();
		expect(screen.getByText('Give the set a name.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Edit set' })).toBeTruthy();
	});

	it('reopens the saved analysis for the profile in the tab', async () => {
		await fakeBrowser.storage.local.set({ ...KEYS, ...saved() });
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		expect(await screen.findByText('Jane Doe')).toBeTruthy();
		expect(screen.getByLabelText('ICP match 77 out of 100')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Analyze again' })).toBeTruthy();
		expect(screen.queryByText('Some sections couldn’t be read')).toBeNull();
	});

	it('shows the summary, quick facts, confidence with quotes, what is missing, and follow-up questions', async () => {
		await fakeBrowser.storage.local.set({ ...KEYS, ...richer() });
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		expect(await screen.findByText('Founder of Acme, selling sales software to mid-size teams.')).toBeTruthy();
		const facts = screen.getByRole('list', { name: 'Quick facts' }).textContent;
		expect(facts).toMatch(/\d+ yrs\s*experience/);
		expect(facts).toContain('Acme');
		expect(facts).toContain('Berlin, Germany');
		expect(facts).toContain('Sales');
		expect(screen.getByText('Missing: No team size on the profile')).toBeTruthy();
		expect(screen.getAllByText('High').length).toBeGreaterThan(0);
		fireEvent.click(screen.getByRole('button', { name: /Can this person decide to buy\?, show evidence/ }));
		expect(await screen.findByText('“Founder at Acme”')).toBeTruthy();
		for (const q of ['Who are their customers?', 'Are they hiring?', 'What did they do before Acme?'])
			expect(screen.getByRole('button', { name: q })).toBeTruthy();
	});

	it('drafts an outreach message only when asked, in a dialog with Copy', async () => {
		let calls = 0;
		messages = () => {
			calls++;
			return new Response(
				JSON.stringify({
					id: 'msg_1',
					type: 'message',
					role: 'assistant',
					model: 'claude-opus-5-5',
					content: [{ type: 'text', text: 'Hi Jane, saw that you founded Acme. Open to a short chat?' }],
					stop_reason: 'end_turn',
					usage: { input_tokens: 10, output_tokens: 10 }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		};
		await fakeBrowser.storage.local.set({ ...KEYS, ...richer() });
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		const menu = await screen.findByRole('button', { name: 'Result actions' });
		expect(calls).toBe(0);
		fireEvent.keyDown(menu, { key: 'Enter' });
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Draft outreach message' }));
		const box = await screen.findByRole('textbox', { name: 'Outreach message' });
		await vi.waitFor(() => expect((box as HTMLTextAreaElement).value).toContain('saw that you founded Acme'));
		expect(calls).toBe(1);
		expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
	});

	it('warns when parts of the profile could not be read', async () => {
		await fakeBrowser.storage.local.set({ ...KEYS, ...saved({ gaps: ['Skills', 'Recent posts'] }) });
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		expect(await screen.findByText('Some sections couldn’t be read')).toBeTruthy();
		expect(screen.getByText(/Couldn’t read: Skills, Recent posts/)).toBeTruthy();
	});

	it('shows a failed chat answer as an error, without an empty reply bubble', async () => {
		messages = () =>
			new Response(
				JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
				{
					status: 401,
					headers: { 'content-type': 'application/json' }
				}
			);
		await fakeBrowser.storage.local.set({ ...KEYS, ...saved() });
		onTab('https://www.linkedin.com/in/jane-doe/');
		const { container } = renderPanel();
		const box = await screen.findByRole('textbox', { name: 'Ask about this person' });
		fireEvent.change(box, { target: { value: 'Who do they sell to?' } });
		fireEvent.click(screen.getByRole('button', { name: 'Send' }));
		expect(await screen.findByText('Anthropic rejected the key')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open AI settings' })).toBeTruthy();
		expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(0);
		expect(container.querySelectorAll('[data-role="user"]')).toHaveLength(1);
		// The raw provider message never reaches the screen.
		expect(screen.queryByText(/invalid x-api-key/)).toBeNull();
	});
});
