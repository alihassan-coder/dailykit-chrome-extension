// The few path helpers mem0 calls while building file paths it never opens in the extension.
const join = (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
const dirname = (p: string) => p.replace(/\/[^/]*$/, '') || '/';
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const resolve = (...parts: string[]) => join(...parts);
const path = { join, dirname, basename, resolve, sep: '/' };
export { join, dirname, basename, resolve };
export const sep = '/';
export default path;
