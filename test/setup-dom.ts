// Browser APIs jsdom leaves out that Radix and cmdk call. Loaded before every test; a no-op outside jsdom.
if (typeof window !== 'undefined') {
	Element.prototype.scrollIntoView ??= function scrollIntoView() {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.releasePointerCapture ??= () => {};
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
