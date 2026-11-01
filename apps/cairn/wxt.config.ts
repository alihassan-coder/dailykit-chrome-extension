import tailwindcss from '@tailwindcss/vite';
import { cairn } from '@toolbelt/tool-cairn';
import { defineConfig } from 'wxt';
import type {} from '@toolbelt/wxt-kit'; // types for the `toolbelt` config key

// Cairn as its own extension, built from the same tool code as the Toolbelt bundle.
export default defineConfig({
	modules: ['@wxt-dev/module-react', '@toolbelt/wxt-kit'],
	manifestVersion: 3, // also for Firefox (WXT defaults Firefox to MV2)
	toolbelt: { mode: 'standalone', tools: [cairn] },
	vite: () => ({ plugins: [tailwindcss()] }),
	manifest: {
		name: 'Cairn',
		description: 'Keep your private Claude and ChatGPT chats, and see context and usage as you type.',
		minimum_chrome_version: '116',
		action: {
			default_title: 'Cairn',
			default_icon: { 16: 'icon/16.png', 24: 'icon/24.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' }
		},
		browser_specific_settings: {
			gecko: { id: '{7360d646-3345-4e59-8009-a29b7d851cef}', strict_min_version: '142.0' }
		}
	}
});
