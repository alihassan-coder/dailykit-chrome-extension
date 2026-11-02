// Vite bundles CSS imports (WXT puts in-page UI styles into the shadow root).
declare module '*.css';

// @toolbelt/ui imports its raster logo; Vite resolves it to a URL.
declare module '*.png' {
	const src: string;
	export default src;
}
