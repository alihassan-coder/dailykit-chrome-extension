// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown, blocks } from '../src/markdown.tsx';

afterEach(cleanup);

describe('the answer renderer', () => {
	it('renders bold, code, lists and safe links', () => {
		const { container } = render(
			<Markdown text={'Found **3** results:\n- `ref_1` first\n- [Docs](https://example.com/docs)\n\n1. one\n2. two'} />
		);
		expect(screen.getByText('3').tagName).toBe('STRONG');
		expect(screen.getByText('ref_1').tagName).toBe('CODE');
		expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('https://example.com/docs');
		expect(container.querySelectorAll('ul > li')).toHaveLength(2);
		expect(container.querySelectorAll('ol > li')).toHaveLength(2);
	});

	it('never renders markup or unsafe links from the text', () => {
		const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> [click](javascript:alert(1))'} />);
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('a')).toBeNull();
		expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
	});

	it('splits paragraphs and keeps code blocks as they are', () => {
		expect(blocks('One\n\nTwo\n```\n**not bold**\n```').map((b) => b.kind)).toEqual(['p', 'p', 'code']);
	});
});
