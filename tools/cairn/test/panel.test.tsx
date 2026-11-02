// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CairnPanel from '../src/panel.tsx';

describe('Cairn panel', () => {
	it('says plainly that chat history is on its way, and what works today', () => {
		render(<CairnPanel />);
		expect(screen.getByText('Chat history is on its way')).toBeTruthy();
		expect(screen.getByText('Save chat button on claude.ai')).toBeTruthy();
		expect(screen.getByText('Search across all your chats')).toBeTruthy();
	});
});
