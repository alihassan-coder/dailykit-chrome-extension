import tailwindcss from '@tailwindcss/vite';
import { cairn } from '@toolbelt/tool-cairn';
import { defineConfig } from 'wxt';
import type {} from '@toolbelt/wxt-kit'; // types for the `toolbelt` config key

// Cairn as its own extension, built from the same tool code as the Toolbelt bundle.
export default defineConfig({
	modules: ['@wxt-dev/module-react', '@toolbelt/wxt-kit'],
	toolbelt: { mode: 'standalone', tools: [cairn] },
	vite: () => ({ plugins: [tailwindcss()] }),
	manifest: {
		name: 'Cairn',
		description: 'Keep your private Claude and ChatGPT chats, and see context and usage as you type.',
		minimum_chrome_version: '116',
		action: { default_title: 'Cairn' },
		browser_specific_settings: {
			gecko: { id: '{7360d646-3345-4e59-8009-a29b7d851cef}', strict_min_version: '142.0' }
		}
	}
});
