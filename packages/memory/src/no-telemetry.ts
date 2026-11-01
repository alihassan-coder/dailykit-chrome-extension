// mem0 reads MEM0_TELEMETRY once, when it loads, and sends usage events to PostHog (and fetches notices from
// GitHub) unless it is 'false'. Without a `process` it defaults to on. This module must be imported before
// mem0ai, so the flag exists first. The app's build adds a fuller `process` shim as well.
const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
g.process ??= {};
g.process.env ??= {};
g.process.env.MEM0_TELEMETRY = 'false';

export {};
