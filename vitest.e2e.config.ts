import { defineConfig } from 'vitest/config';

// Real-browser tests. Build first (pnpm build), and set CHROME to a Chrome for Testing binary.
export default defineConfig({
	test: {
		include: ['e2e/**/*.e2e.ts'],
		testTimeout: 20_000,
		fileParallelism: false
	}
});
