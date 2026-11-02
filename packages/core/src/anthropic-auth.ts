// Headers for calling the Anthropic API straight from the extension with the user's own API key.
// Claude subscription tokens (from `claude setup-token`) are not accepted: Anthropic only allows them in its own
// apps, so Toolbelt never presents itself as Claude Code. See isClaudeSetupToken in ai-keys.ts.

export function anthropicHeaders(): Record<string, string> {
	// Required for browser-origin requests; the key belongs to the user and never leaves their device otherwise.
	return { 'anthropic-dangerous-direct-browser-access': 'true' };
}

export function anthropicAuthHeaders(apiKey: string): Record<string, string> {
	return { ...anthropicHeaders(), 'anthropic-version': '2023-06-01', 'x-api-key': apiKey };
}
