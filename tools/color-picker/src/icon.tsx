// Colour picker's mark: a pipette (bulb, collar, glass tube) with a drop of colour at its tip.
export default function ColorPickerIcon({ size = 20 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<circle cx="14.6" cy="5.4" r="3.1" fill="currentColor" />
			<path d="m9.9 7.9 2.2 2.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
			<path d="M10.4 9.6 5.2 14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
			<path d="M3.6 15.6c.5.9.9 1.5.9 2a.9.9 0 1 1-1.8 0c0-.5.4-1.1.9-2Z" fill="currentColor" opacity="0.6" />
		</svg>
	);
}
