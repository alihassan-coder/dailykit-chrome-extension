import tailwindcss from '@tailwindcss/vite';
import { cairn } from '@toolbelt/tool-cairn';
import { defineConfig } from 'wxt';
import type {} from '@toolbelt/wxt-kit'; // types for the `toolbelt` config key

// The Toolbelt bundle: every tool. Personal use (unpacked / unlisted); tools that are sold ship as standalone apps.
export default defineConfig({
	modules: ['@wxt-dev/module-react', '@toolbelt/wxt-kit'],
	toolbelt: { mode: 'bundle', tools: [cairn] },
	vite: () => ({ plugins: [tailwindcss()] }),
	manifest: {
		name: 'Toolbelt',
		description: 'Your own browser tools, in one side panel.',
		permissions: ['storage'],
		minimum_chrome_version: '116',
		action: { default_title: 'Toolbelt' },
		browser_specific_settings: {
			gecko: { id: '{edc60449-e9d6-4c09-b757-6666e79d0bd7}', strict_min_version: '142.0' }
		}
	}
});
