// Black and white's mark: a circle, half colour, half not.
export default function GrayscaleIcon({ size = 20 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
			<path d="M10 3a7 7 0 0 1 0 14V3Z" fill="currentColor" />
		</svg>
	);
}
