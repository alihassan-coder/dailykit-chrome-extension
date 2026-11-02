// Vite (and so Vitest) imports a file as a string with ?raw: the HTML fixtures.
declare module '*.html?raw' {
	const html: string;
	export default html;
}
