// mem0 imports fs for its SQLite and notice files, which the extension never uses.
const fs = {
	existsSync: () => false,
	mkdirSync: () => undefined,
	readFileSync: () => {
		throw new Error('No file system in the extension.');
	},
	writeFileSync: () => undefined
};
export const { existsSync, mkdirSync, readFileSync, writeFileSync } = fs;
export default fs;
