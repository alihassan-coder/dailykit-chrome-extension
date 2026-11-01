import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts', '{packages,tools}/*/test/**/*.test.{ts,tsx}'],
		// Database tests start real Postgres (PGlite, WebAssembly); the first start takes several seconds.
		hookTimeout: 60_000,
		testTimeout: 30_000
	}
});
