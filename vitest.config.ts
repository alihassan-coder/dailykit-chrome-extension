import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts', '{packages,tools}/*/test/**/*.test.{ts,tsx}']
	}
});
