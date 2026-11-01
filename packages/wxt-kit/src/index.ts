// WXT module that turns tool descriptors into entrypoints and a manifest, for either product shape
// (see applyTools). It also exposes `virtual:toolbelt/registry` so the background knows each tool and
// its built script paths without importing the build-time descriptors.
import 'wxt';
import { addViteConfig, defineWxtModule } from 'wxt/modules';
import type { ToolDescriptor } from '@toolbelt/core';
import { tailwindPrefixPlugin } from './css.ts';
import { applyTools, entryName, runtimeRegistry, type BuildMode, type SiteAccess } from './manifest.ts';

export { applyTools, entryName, runtimeRegistry, scriptFile, type BuildMode, type SiteAccess } from './manifest.ts';
export { prefixTailwindVars } from './css.ts';

export interface ToolbeltOptions {
	mode: BuildMode;
	tools: ToolDescriptor[];
	siteAccess?: SiteAccess;
}

declare module 'wxt' {
	interface InlineConfig {
		toolbelt?: ToolbeltOptions;
	}
}

const VIRTUAL_ID = 'virtual:toolbelt/registry';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export default defineWxtModule<ToolbeltOptions>({
	name: '@toolbelt/wxt-kit',
	configKey: 'toolbelt',
	setup(wxt, options) {
		if (!options) throw new Error('wxt-kit: set `toolbelt: { mode, tools }` in wxt.config.ts');
		const { mode, tools, siteAccess = 'per-tool' } = options;

		wxt.hook('entrypoints:found', (_wxt, infos) => {
			for (const tool of tools) {
				for (const s of tool.contentScripts) {
					infos.push({ name: entryName(tool.id, s.id), inputPath: s.entry, type: 'content-script' });
				}
			}
		});

		addViteConfig(wxt, () => ({
			plugins: [
				tailwindPrefixPlugin(),
				{
					name: 'toolbelt-registry',
					resolveId: (id: string) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
					load: (id: string) =>
						id === RESOLVED_ID ? `export default ${JSON.stringify(runtimeRegistry(tools, mode))};` : undefined
				}
			]
		}));

		wxt.hook('build:manifestGenerated', (_wxt, manifest) => {
			// WXT expects the manifest object mutated in place; applyTools may drop keys, so remove those too.
			const next = applyTools(manifest, tools, mode, siteAccess);
			for (const key of Object.keys(manifest) as (keyof typeof manifest)[]) if (!(key in next)) delete manifest[key];
			Object.assign(manifest, next);
		});
	}
});
