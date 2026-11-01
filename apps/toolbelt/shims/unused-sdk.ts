// mem0 imports the OpenAI SDK (and axios) at the top for its built-in providers. Toolbelt replaces those
// providers with small fetch adapters (packages/memory/src/providers.ts), so the SDKs never run; this keeps
// about 200 KB of unused client code out of the background.
class Unavailable {
	constructor() {
		throw new Error('This SDK is not bundled in Toolbelt; memory uses its own providers.');
	}
}
export { Unavailable as AzureOpenAI, Unavailable as OpenAI };
export default Unavailable;
