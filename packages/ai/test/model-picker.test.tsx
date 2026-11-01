// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPicker } from '../src/ModelPicker.tsx';
import type { ModelInfo } from '../src/models.ts';

afterEach(cleanup);

const models: ModelInfo[] = [
	{ provider: 'anthropic', id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
	{ provider: 'anthropic', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
	{ provider: 'gemini', id: 'gemini-pro-x', name: 'Gemini Pro X' }
];

function setup() {
	const onChoose = vi.fn();
	render(
		<ModelPicker
			models={models}
			choice={{ provider: 'anthropic', model: 'claude-opus-5-5' }}
			onChoose={onChoose}
			onRefresh={() => {}}
			refreshing={false}
		/>
	);
	fireEvent.click(screen.getByRole('button', { name: /Change model/ }));
	return { onChoose, search: screen.getByRole('combobox', { name: 'Search models' }) };
}

describe('ModelPicker', () => {
	it('filters as you type and chooses with Enter', () => {
		const { onChoose, search } = setup();
		fireEvent.change(search, { target: { value: 'haiku' } });
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Claude Haiku 5.5claude-haiku-5-5']);
		fireEvent.keyDown(search, { key: 'Enter' });
		expect(onChoose).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-haiku-5-5' });
	});

	it('finds models by provider name and moves with the arrow keys', () => {
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
});
