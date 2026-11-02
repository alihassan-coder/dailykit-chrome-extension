import { BrandIcon } from '@toolbelt/ui';

/** The tool's mark: a coloured tile, or with `mono` just the glyph in the current text colour (menus, dense lists). */
export default function GrayscaleIcon({ size = 20, mono }: { size?: number; mono?: boolean }) {
	return <BrandIcon mark="grayscale" size={size} mono={mono} />;
}
