import { isClaudeSetupToken } from './ai-keys.ts';

/** Claude Code compatibility headers used by the setup-token route in pi/OpenClaw.
 * Reference: https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts
 * Keep the version floor in step with that adapter when Anthropic gates new models.
 */
export function anthropicHeaders(credential: string): Record<string, string> {
	return {
		'anthropic-dangerous-direct-browser-access': 'true',
		...(isClaudeSetupToken(credential)
			? {
					'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
					'user-agent': 'claude-cli/2.1.280',
					'x-app': 'cli'
				}
			: {})
	};
}

export function anthropicAuthHeaders(credential: string): Record<string, string> {
	return {
		...anthropicHeaders(credential),
		'anthropic-version': '2023-06-01',
		...(isClaudeSetupToken(credential) ? { Authorization: `Bearer ${credential}` } : { 'x-api-key': credential })
	};
}

export const CLAUDE_CODE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";
