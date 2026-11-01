import { describe, expect, it } from 'vitest';
import { timeAgo } from '../src/format.ts';

describe('timeAgo', () => {
	const now = 1_800_000_000_000;
	it('reads naturally', () => {
		expect(timeAgo(null, now)).toBe('not yet');
		expect(timeAgo(now - 10_000, now)).toBe('just now');
		expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
		expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
		expect(timeAgo(now - 3 * 86_400_000, now)).toMatch(/\d/);
	});
});
