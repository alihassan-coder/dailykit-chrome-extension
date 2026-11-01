// Browser agent's mark: a pointer with the trail of its last moves.
export default function AgentIcon({ size = 20 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<path d="M8 6.5 16.5 10l-3.6 1.3-1.3 3.6L8 6.5Z" fill="currentColor" />
			<circle cx="4" cy="15.5" r="1.4" fill="currentColor" opacity="0.4" />
			<circle cx="3.2" cy="9.8" r="1.1" fill="currentColor" opacity="0.6" />
			<circle cx="8.5" cy="3" r="0.9" fill="currentColor" opacity="0.8" />
		</svg>
	);
}
