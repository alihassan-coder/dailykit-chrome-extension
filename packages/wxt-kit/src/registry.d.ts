declare module 'virtual:toolbelt/registry' {
	import type { FeatureSpec, RunAt, World } from '@toolbelt/core';
	const registry: {
		mode: 'bundle' | 'standalone';
		tools: {
			id: string;
			name: string;
			description: string;
			hostMatches: string[];
			features: FeatureSpec[];
			contentScripts: { id: string; matches: string[]; world: World; runAt: RunAt; js: string[] }[];
		}[];
	};
	export default registry;
}
