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
const onTab = (url: string) => vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: 7, url }] as never);
const KEYS = { 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } };

/** An analysis saved in the old shape (one per person), to check it still opens. */
const saved = (over: Record<string, unknown> = {}) => ({
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
		analyzedAt: Date.now()
	}
});

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
		expect(screen.getByText(/Open someone’s LinkedIn profile/)).toBeTruthy();
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
