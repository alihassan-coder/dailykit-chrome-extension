// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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

beforeEach(() => {
	fakeBrowser.reset();
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(
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
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } });
		onTab('https://www.linkedin.com/feed/');
		renderPanel();
		const analyze = await screen.findByRole('button', { name: 'Analyze this profile' });
		expect((analyze as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/Open someone’s LinkedIn profile/)).toBeTruthy();
	});

	it('is ready on a profile, with the starter question sets', async () => {
		await fakeBrowser.storage.local.set({ 'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' } });
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		const analyze = await screen.findByRole('button', { name: 'Analyze this profile' });
		expect((analyze as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByText('linkedin.com/in/jane-doe')).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Question set' }).textContent).toContain('Sales lead');
	});

	it('reopens the saved analysis for the profile in the tab', async () => {
		await fakeBrowser.storage.local.set({
			'tb:ai:keys': { anthropic: 'sk-ant-test-0123456789abcdef' },
			'tb:profile-lens:saved:jane-doe': {
				profile: {
					slug: 'jane-doe',
					url: 'https://www.linkedin.com/in/jane-doe/',
					name: 'Jane Doe',
					photo: null,
					connections: null,
					followers: null
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
		onTab('https://www.linkedin.com/in/jane-doe/');
		renderPanel();
		expect(await screen.findByText('Jane Doe')).toBeTruthy();
		expect(screen.getByLabelText('ICP match 77 out of 100')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Analyze again' })).toBeTruthy();
	});
});
