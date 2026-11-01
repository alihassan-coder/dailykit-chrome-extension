// mem0 imports better-sqlite3 (a native Node module) for its local stores. Toolbelt never selects them.
export default class Database {
	constructor() {
		throw new Error('SQLite is not available in the extension.');
	}
}
