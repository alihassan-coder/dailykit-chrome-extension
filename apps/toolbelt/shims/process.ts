// A minimal `process` for the background, imported before anything else. mem0 reads process.env when it
// loads (and would crash without it), and turns its telemetry on unless MEM0_TELEMETRY is 'false'.
// `versions` has no `node`, so mem0 also skips its ~/.mem0 id file.
const g = globalThis as { process?: unknown };
g.process ??= {
	env: {},
	versions: {},
	platform: 'browser',
	cwd: () => '/',
	pid: 0,
	stderr: { write: () => true },
	stdout: { write: () => true }
};
(g.process as { env: Record<string, string> }).env.MEM0_TELEMETRY = 'false';

export {};
