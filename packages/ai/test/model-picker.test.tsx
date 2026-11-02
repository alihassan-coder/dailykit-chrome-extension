// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPicker } from '../src/ModelPicker.tsx';
import type { ModelInfo } from '../src/models.ts';

afterEach(cleanup);

const models: ModelInfo[] = [
	{ provider: 'anthropic', id: 'claude-opus-5-5', name: 'Claude Opus 5.5', context: 200_000, vision: true },
	{ provider: 'anthropic', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
	{ provider: 'gemini', id: 'gemini-pro-x', name: 'Gemini Pro X' },
	{ provider: 'gemini', id: 'gemma-x-it', name: 'Gemma X' }
];

function setup(props: { toolsOnly?: boolean; onRefresh?: () => void; refreshing?: boolean } = {}) {
	const onChoose = vi.fn();
	render(
		<ModelPicker
			models={models}
			choice={{ provider: 'anthropic', model: 'claude-opus-5-5' }}
			onChoose={onChoose}
			onRefresh={props.onRefresh ?? (() => {})}
			refreshing={props.refreshing ?? false}
			toolsOnly={props.toolsOnly}
		/>
	);
	fireEvent.click(screen.getByRole('button', { name: 'Model: Claude Opus 5.5. Change model' }));
	return { onChoose, search: screen.getByRole('combobox', { name: 'Search models' }) };
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('ModelPicker', () => {
	it('groups models by provider with context size, and marks the chosen one', () => {
		setup();
		expect(screen.getByText('Anthropic')).toBeTruthy();
		expect(screen.getByText('Google')).toBeTruthy();
		const opus = screen.getByRole('option', { name: /Claude Opus 5\.5/ });
		expect(opus.textContent).toContain('200K');
		expect(opus.textContent).toContain('reads images');
		expect(screen.getByText('4 models')).toBeTruthy();
	});

	it('filters as you type and chooses with Enter', () => {
		const { onChoose, search } = setup();
		fireEvent.change(search, { target: { value: 'haiku' } });
		expect(optionNames()).toEqual(['Claude Haiku 5.5']);
		fireEvent.keyDown(search, { key: 'Enter' });
		expect(onChoose).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-haiku-5-5' });
	});

	it('finds models by provider name', () => {
		const { onChoose, search } = setup();
		fireEvent.change(search, { target: { value: 'google' } });
		fireEvent.keyDown(search, { key: 'Enter' });
		expect(onChoose).toHaveBeenCalledWith({ provider: 'gemini', model: 'gemini-pro-x' });
	});

	it('lets you use an exact model id that is not listed yet', () => {
		const { onChoose, search } = setup();
		fireEvent.change(search, { target: { value: 'claude-new-model' } });
		fireEvent.click(screen.getByRole('option', { name: 'Use “claude-new-model”' }));
		expect(onChoose).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-new-model' });
	});

	it('hides models that cannot call tools when an agent needs them', () => {
		setup({ toolsOnly: true });
		expect(optionNames().some((n) => n?.includes('Gemma'))).toBe(false);
		expect(screen.getByText('3 models')).toBeTruthy();
	});

	it('refreshes from the footer and shows when it is busy', () => {
		const onRefresh = vi.fn();
		setup({ onRefresh });
		fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
		expect(onRefresh).toHaveBeenCalledOnce();
		cleanup();
		setup({ refreshing: true });
		expect((screen.getByRole('button', { name: /Refreshing/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});
