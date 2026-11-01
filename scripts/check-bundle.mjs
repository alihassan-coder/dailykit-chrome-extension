// Checks what ships, after `pnpm build`:
//   1. Size budgets. Page scripts load on every matching site, so a regression (a stray React import) costs
//      every page load.
//   2. The database link from .env appears only in the background worker of the personal build, never in a
//      page, a page script, or a sold app.
//   3. Any product that ships WebAssembly allows it in its manifest's security policy. Chrome blocks it by
//      default, and unit tests (Node) cannot see that, so the first sign would be a broken extension.
// Run: node scripts/check-bundle.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KB = 1024;
const budgets = [
	// Loads once per browser session, not per page. ~190 KB: Neon's driver (it ships its pool and WebSocket
	// code even though only HTTP is used) and Argon2 in WebAssembly. Plus ~410 KB for agent memory: the mem0
	// SDK is one file that keeps every provider it supports (its factories name them all), so it cannot be
	// tree-shaken; its own OpenAI/axios clients are already stubbed out (apps/toolbelt/shims).
	{ match: /^background\.js$/, max: 700 * KB, why: 'background: database, encryption, sync and agent memory' },
	{ match: /^content-scripts\/.+-ui\.js$/, max: 350 * KB, why: 'in-page UI (React)' },
	{ match: /^content-scripts\/.+\.js$/, max: 15 * KB, why: 'page script, loads on every matching site' }
];

let failed = false;
const fail = (message) => {
	failed = true;
	console.log(`FAIL ${message}`);
};

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
		d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]
	);
}

// Secrets to look for: the database host and password from .env, if there is one.
const secrets = [];
if (existsSync('.env')) {
	const line = readFileSync('.env', 'utf8')
		.match(/^DATABASE_URL=(.+)$/m)?.[1]
		?.trim()
		.replace(/^['"]|['"]$/g, '');
	if (line) {
		const url = new URL(line);
		secrets.push(url.hostname);
		if (url.password) secrets.push(decodeURIComponent(url.password));
	}
}

for (const app of readdirSync('apps')) {
	const out = join('apps', app, '.output', 'chrome-mv3');
	if (!existsSync(out)) {
		console.error(`No build for ${app}. Run pnpm build first.`);
		process.exit(1);
	}

	const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
	const csp = manifest.content_security_policy?.extension_pages ?? '';
	const usesWasm = walk(out).some(
		(p) => p.endsWith('.js') && /WebAssembly\.(compile|instantiate)/.test(readFileSync(p, 'utf8'))
	);
	if (usesWasm && !csp.includes("'wasm-unsafe-eval'")) {
		fail(`${app} ships WebAssembly but its manifest CSP does not allow 'wasm-unsafe-eval'`);
	} else if (usesWasm) {
		console.log(`ok   ${app} ships WebAssembly and its manifest allows it`);
	}

	for (const path of walk(out)) {
		const file = relative(out, path);
		const budget = budgets.find((b) => b.match.test(file));
		if (budget) {
			const size = statSync(path).size;
			const line = `${app}/${file}  ${(size / KB).toFixed(1)} KB of ${budget.max / KB} KB (${budget.why})`;
			if (size > budget.max) fail(line);
			else console.log(`ok   ${line}`);
		}

		if (!secrets.length || !/\.(js|html|css|json)$/.test(file)) continue;
		const allowed = app === 'toolbelt' && file === 'background.js';
		const text = readFileSync(path, 'utf8');
		if (!allowed && secrets.some((s) => text.includes(s))) fail(`${app}/${file} contains the database link from .env`);
	}
}

if (secrets.length) console.log(`ok   database link found only where allowed (${secrets.length} parts checked)`);
process.exit(failed ? 1 : 0);
