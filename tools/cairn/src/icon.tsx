// Cairn's mark: three stacked stones, the trail marker the tool is named after.
export default function CairnIcon({ size = 20 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
			<rect x="7" y="2.5" width="6" height="4" rx="2" />
			<rect x="4.5" y="8" width="10" height="4.5" rx="2.25" opacity="0.8" />
			<rect x="2.5" y="14" width="15" height="4" rx="2" opacity="0.6" />
		</svg>
	);
}
