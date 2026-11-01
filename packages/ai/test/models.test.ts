import { describe, expect, it, vi } from 'vitest';
import { MAX_AGE_MS, available, fetchModels, isChatModel, keyTag, refresh, stale } from '../src/models.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchModels', () => {
	it('reads every page of Anthropic models with display names', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				reply({
					data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }],
					has_more: true,
					last_id: 'claude-opus-5-5'
				})
			)
			.mockResolvedValueOnce(
				reply({ data: [{ id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }], has_more: false })
			);
		const models = await fetchModels('anthropic', 'sk-ant-x', fetchFn);
		expect(models.map((m) => m.name)).toEqual(['Claude Opus 5.5', 'Claude Haiku 5.5']);
		expect(fetchFn.mock.calls[1]![0]).toContain('after_id=claude-opus-5-5');
		expect(fetchFn.mock.calls[0]![1].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
	});

	it('keeps only chat models from OpenAI and xAI', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () =>
			reply({
				data: [
					{ id: 'gpt-x' },
					{ id: 'text-embedding-3-small' },
					{ id: 'whisper-1' },
					{ id: 'dall-e-3' },
					{ id: 'gpt-x-mini' }
				]
			})
		);
		expect((await fetchModels('openai', 'sk', fetchFn)).map((m) => m.id)).toEqual(['gpt-x-mini', 'gpt-x']);
		expect(fetchFn.mock.calls[0]![0]).toBe('https://api.openai.com/v1/models');
		await fetchModels('xai', 'xai-k', fetchFn);
		expect(fetchFn.mock.calls[1]![0]).toBe('https://api.x.ai/v1/models');
	});

	it('keeps Gemini models that generate content, without the models/ prefix', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			reply({
				models: [
					{ name: 'models/gemini-pro-x', displayName: 'Gemini Pro X', supportedGenerationMethods: ['generateContent'] },
					{ name: 'models/text-embedding-x', supportedGenerationMethods: ['embedContent'] }
				]
			})
		);
		expect(await fetchModels('gemini', 'AIza', fetchFn)).toEqual([
			{ provider: 'gemini', id: 'gemini-pro-x', name: 'Gemini Pro X' }
		]);
	});

	it('explains failures plainly', async () => {
		await expect(fetchModels('openai', 'bad', vi.fn().mockResolvedValue(reply({}, 401)))).rejects.toThrow(
			'rejected this API key'
		);
		await expect(
			fetchModels('openai', 'k', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
		).rejects.toThrow('offline');
	});

	it('filters non-chat ids', () => {
		expect(isChatModel('gpt-realtime')).toBe(false);
		expect(isChatModel('grok-x')).toBe(true);
	});
});

describe('caching', () => {
	const keys = { anthropic: 'sk-ant-1' };
	const fresh = { anthropic: { models: [], fetchedAt: 1000, key: keyTag('sk-ant-1') } };

	it('refreshes only when missing, a day old, or the key changed', () => {
		expect(stale({}, keys, 1000)).toEqual(['anthropic']);
		expect(stale(fresh, keys, 2000)).toEqual([]);
		expect(stale(fresh, keys, 1000 + MAX_AGE_MS + 1)).toEqual(['anthropic']);
		expect(stale(fresh, { anthropic: 'sk-ant-2' }, 2000)).toEqual(['anthropic']);
	});

	it('keeps the old list when a refresh fails', async () => {
		const cached = {
			anthropic: {
				models: [{ provider: 'anthropic' as const, id: 'old', name: 'Old' }],
				fetchedAt: 0,
				key: keyTag('sk-ant-1')
			}
		};
		const { cache, errors } = await refresh(cached, keys, {
			force: true,
			fetchFn: vi.fn().mockResolvedValue(reply({}, 500))
		});
		expect(cache.anthropic?.models[0]?.id).toBe('old');
		expect(errors.anthropic).toMatch(/500/);
	});

	it('offers live lists, or verified Claude ids before the first load, and nothing guessed', () => {
		expect(available({}, keys).map((m) => m.id)).toContain('claude-opus-5-5');
		expect(available({}, { openai: 'sk' })).toEqual([]);
	});
});
