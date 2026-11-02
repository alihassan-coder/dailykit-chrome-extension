// Vite bundles CSS imports.
declare module '*.css';

// @toolbelt/ui imports its raster logo; Vite resolves it to a URL.
declare module '*.png' {
	const src: string;
	export default src;
}
