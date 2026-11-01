// WXT hoists Tailwind's `@property --tw-*` rules into the host page's <head> (shadow roots ignore @property).
// Typed `--tw-*` properties there break sites that use Tailwind themselves (wxt-dev/wxt#1955), so ours get
// their own prefix. Remove once WXT ships `cssPropertyRename` (wxt-dev/wxt#2005).
const TW = /--tw-/g;
export const PREFIX = '--tb-tw-';

export const prefixTailwindVars = (css: string) => css.replace(TW, PREFIX);

interface OutputFile {
	type: string;
	source?: unknown;
	code?: string;
}

export function tailwindPrefixPlugin() {
	return {
		name: 'toolbelt-prefix-tailwind-vars',
		enforce: 'post' as const,
		transform(code: string, id: string) {
			if (!/\.css($|\?)/.test(id) || !code.includes('--tw-')) return undefined;
			return { code: prefixTailwindVars(code), map: null };
		},
		// CSS inlined into content-script chunks (cssInjectionMode: 'ui') and emitted .css assets.
		generateBundle(_: unknown, bundle: Record<string, OutputFile>) {
			for (const file of Object.values(bundle)) {
				if (file.type === 'asset' && typeof file.source === 'string') file.source = prefixTailwindVars(file.source);
				if (file.type === 'chunk' && file.code?.includes('--tw-')) file.code = prefixTailwindVars(file.code);
			}
		}
	};
}
