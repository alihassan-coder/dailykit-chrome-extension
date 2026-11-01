import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { cairn } from '@toolbelt/tool-cairn';
import { colorPicker } from '@toolbelt/tool-color-picker';
import { grayscale } from '@toolbelt/tool-grayscale';
import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';
import type {} from '@toolbelt/wxt-kit'; // types for the `toolbelt` config key

// The personal build connects to the owner's Neon database from the repo's .env (never committed). Only the
// background uses it; scripts/check-bundle.mjs fails the build if it shows up anywhere else.
const env = loadEnv('', fileURLToPath(new URL('../..', import.meta.url)), '');

// The Toolbelt bundle: every tool. Personal use (unpacked / unlisted); tools that are sold ship as standalone apps.
export default defineConfig({
	modules: ['@wxt-dev/module-react', '@toolbelt/wxt-kit'],
	manifestVersion: 3, // also for Firefox (WXT defaults Firefox to MV2)
	// Personal build: every site at install, so new tools (LinkedIn, GitHub, ...) just work.
	toolbelt: { mode: 'bundle', siteAccess: 'all', tools: [cairn, colorPicker, grayscale] },
	vite: () => ({
		plugins: [tailwindcss()],
		define: { __TB_DATABASE_URL__: JSON.stringify(env.DATABASE_URL ?? '') }
	}),
	manifest: {
		name: 'Toolbelt',
		description: 'Your own browser tools, in one side panel.',
		permissions: ['storage', 'alarms'],
		// Argon2 (master password) runs as WebAssembly bundled in the extension. Chrome's default extension
		// policy blocks compiling it; 'wasm-unsafe-eval' allows only that, not eval() or remote code.
		content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" },
		minimum_chrome_version: '116',
		action: { default_title: 'Toolbelt' },
		browser_specific_settings: {
			gecko: { id: '{edc60449-e9d6-4c09-b757-6666e79d0bd7}', strict_min_version: '142.0' }
		}
	}
});
