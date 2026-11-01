// Size budgets for what ships, checked after `pnpm build`. Page scripts load on every matching site, so a
// regression there (like a stray React import) costs every page load. Run: node scripts/check-bundle.mjs
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KB = 1024;
const budgets = [
	{ match: /^background\.js$/, max: 20 * KB, why: 'background worker' },
	{ match: /^content-scripts\/.+-ui\.js$/, max: 350 * KB, why: 'in-page UI (React)' },
	{ match: /^content-scripts\/.+\.js$/, max: 15 * KB, why: 'page script, loads on every matching site' }
];

let failed = false;
for (const app of readdirSync('apps')) {
	const out = join('apps', app, '.output', 'chrome-mv3');
	let files;
	try {
		files = ['background.js', ...readdirSync(join(out, 'content-scripts')).map((f) => `content-scripts/${f}`)];
	} catch {
		console.error(`No build for ${app}. Run pnpm build first.`);
		process.exit(1);
	}
	for (const file of files) {
		const budget = budgets.find((b) => b.match.test(file));
		if (!budget) continue;
		const size = statSync(join(out, file)).size;
		const ok = size <= budget.max;
		failed ||= !ok;
		console.log(
			`${ok ? 'ok  ' : 'OVER'} ${app}/${file}  ${(size / KB).toFixed(1)} KB of ${budget.max / KB} KB (${budget.why})`
		);
	}
}
process.exit(failed ? 1 : 0);
