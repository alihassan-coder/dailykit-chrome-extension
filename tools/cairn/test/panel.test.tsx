// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CairnPanel from '../src/panel.tsx';

describe('Cairn panel', () => {
	it('says plainly that chat history is on its way', () => {
		render(<CairnPanel />);
		expect(screen.getByText('Chat history is being built')).toBeTruthy();
	});
});
