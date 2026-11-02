// Messages between the side panel (where the agent runs) and the page script (which reads and acts).
import type { PageAction } from './actuation.ts';

export type PageRequest =
	| { type: 'agent:ping' }
	| { type: 'agent:read'; all?: boolean; ref?: string }
	| { type: 'agent:find'; query: string }
	| { type: 'agent:text' }
	/** The text the user has selected on the page ('' for none). */
	| { type: 'agent:selection' }
	| { type: 'agent:target'; ref: string }
	| { type: 'agent:focused' }
	| { type: 'agent:act'; action: PageAction }
	| { type: 'agent:wait'; selector?: string; text?: string; timeoutMs?: number }
	| { type: 'agent:highlight'; ref: string | null };

export const isPageRequest = (m: unknown): m is PageRequest =>
	typeof m === 'object' &&
	m !== null &&
	typeof (m as { type?: unknown }).type === 'string' &&
	(m as { type: string }).type.startsWith('agent:');
