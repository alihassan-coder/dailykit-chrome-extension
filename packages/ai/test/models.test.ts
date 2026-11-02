import { describe, expect, it, vi } from 'vitest';
import {
	MAX_AGE_MS,
	available,
	fetchModels,
	formatContext,
	isChatModel,
	keyTag,
	refresh,
	stale,
	supportsTools
} from '../src/models.ts';
import { choiceProblem } from '../src/useModels.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchModels', () => {
	it('lists Claude models using bearer authentication for setup tokens', async () => {
		const token = `sk-ant-oat01-${'x'.repeat(90)}`;
		const fetchFn = vi.fn().mockResolvedValue(reply({ data: [{ id: 'claude-haiku-5-5' }] }));
		await fetchModels('anthropic', token, fetchFn);
		const headers = fetchFn.mock.calls[0]![1].headers;
		expect(headers.Authorization).toBe(`Bearer ${token}`);
		expect(headers['x-api-key']).toBeUndefined();
		expect(headers['anthropic-beta']).toContain('oauth-2025-04-20');
		await expect(fetchModels('anthropic', token, vi.fn().mockResolvedValue(reply({}, 401)))).rejects.toThrow(
			'claude setup-token'
		);
	});
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
			{ provider: 'gemini', id: 'gemini-pro-x', name: 'Gemini Pro X', vision: true }
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

	it('marks models that cannot call tools, and reads context sizes', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			reply({
				models: [
					{
						name: 'models/gemma-x-it',
						displayName: 'Gemma X',
						inputTokenLimit: 8192,
						supportedGenerationMethods: ['generateContent']
					},
					{ name: 'models/gemini-pro-x', inputTokenLimit: 1_048_576, supportedGenerationMethods: ['generateContent'] }
				]
			})
		);
		const [gemma, pro] = await fetchModels('gemini', 'AIza', fetchFn);
		expect(supportsTools(gemma!)).toBe(false);
		expect(supportsTools(pro!)).toBe(true);
		expect(formatContext(pro!.context)).toBe('1M');
		expect(formatContext(gemma!.context)).toBe('8K');
		// Lists cached before tool support was stored are still checked by id.
		expect(supportsTools({ provider: 'gemini', id: 'gemma-3-27b-it', name: 'Gemma' })).toBe(false);
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

	it('drops an old credential’s model list when a replacement cannot refresh', async () => {
		const replacement = { anthropic: `sk-ant-oat01-${'x'.repeat(90)}` };
		expect(available(fresh, replacement).length).toBeGreaterThan(0);
		const { cache } = await refresh(fresh, replacement, {
			fetchFn: vi.fn().mockResolvedValue(reply({}, 401))
		});
		expect(cache.anthropic).toBeUndefined();
	});

	it('offers live lists, or verified Claude ids before the first load, and nothing guessed', () => {
		expect(available({}, keys).map((m) => m.id)).toContain('claude-opus-5-5');
		expect(available({}, { openai: 'sk' })).toEqual([]);
	});
});

describe('the saved model', () => {
	const keys = { anthropic: 'sk-ant-1' };
	const live = {
		anthropic: {
			models: [{ provider: 'anthropic' as const, id: 'claude-opus-5-5', name: 'Opus' }],
			fetchedAt: 0,
			key: keyTag('sk-ant-1')
		}
	};

	it('is flagged when the live list no longer has it', () => {
		expect(choiceProblem({ provider: 'anthropic', model: 'claude-gone' }, live, keys)).toMatchObject({
			code: 'model_not_found',
			severity: 'warn'
		});
		expect(choiceProblem({ provider: 'anthropic', model: 'claude-opus-5-5' }, live, keys)).toBeNull();
	});

	it('is not flagged before a live list has loaded', () => {
		expect(choiceProblem({ provider: 'anthropic', model: 'claude-gone' }, {}, keys)).toBeNull();
	});
});
