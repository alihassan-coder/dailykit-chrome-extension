// Small formatting helpers shared by every screen.

/** "just now", "5 min ago", "3 h ago", then a date. */
export function timeAgo(ms: number | null, now = Date.now()): string {
	if (!ms) return 'not yet';
	const s = Math.round((now - ms) / 1000);
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	return new Date(ms).toLocaleDateString();
}
