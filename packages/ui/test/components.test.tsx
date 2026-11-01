// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../src/CommandPalette.tsx';
import { Segmented, Switch, ToolMark } from '../src/components.tsx';

afterEach(cleanup);

describe('Switch', () => {
	it('is a labelled switch that reports the new value', () => {
		const onChange = vi.fn();
		render(<Switch label="Black and white" checked={false} onChange={onChange} />);
		const sw = screen.getByRole('switch', { name: 'Black and white' });
		expect(sw.getAttribute('aria-checked')).toBe('false');
		fireEvent.click(sw);
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('does nothing when disabled', () => {
		const onChange = vi.fn();
		render(<Switch label="Off" checked disabled onChange={onChange} />);
		fireEvent.click(screen.getByRole('switch'));
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe('Segmented', () => {
	it('marks the current option and reports a new choice', () => {
		const onChange = vi.fn();
		render(
			<Segmented
				label="Mode"
				value="light"
				onChange={onChange}
				options={[
					{ value: 'light', label: 'Light' },
					{ value: 'dark', label: 'Dark' }
				]}
			/>
		);
		expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
		fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
		expect(onChange).toHaveBeenCalledWith('dark');
	});
});

describe('ToolMark', () => {
	it('shows the tool’s logo, or its initials until it has one', () => {
		const { container, rerender } = render(<ToolMark name="Colour picker" />);
		expect(container.textContent).toBe('Cp');
		rerender(<ToolMark name="Colour picker" icon={<svg data-testid="logo" />} />);
		expect(screen.getByTestId('logo')).toBeTruthy();
	});
});

describe('CommandPalette', () => {
	const setup = () => {
		const ran: string[] = [];
		const onClose = vi.fn();
		const commands = ['Colour picker', 'Black and white', 'Appearance settings'].map((title) => ({
			id: title,
			title,
			run: () => ran.push(title)
		}));
		render(<CommandPalette open onClose={onClose} commands={commands} />);
		return { ran, onClose, input: screen.getByRole('combobox') };
	};

	it('filters as you type and runs the top result on Enter', () => {
		const { ran, onClose, input } = setup();
		fireEvent.change(input, { target: { value: 'black' } });
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Black and white']);
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(ran).toEqual(['Black and white']);
		expect(onClose).toHaveBeenCalled();
	});

	it('moves with the arrow keys and closes on Escape', () => {
		const { ran, onClose, input } = setup();
		fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(ran).toEqual(['Black and white']);
		fireEvent.keyDown(input, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('says so when nothing matches', () => {
		const { input } = setup();
		fireEvent.change(input, { target: { value: 'zzz' } });
		expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy();
	});
});
