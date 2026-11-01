// mem0 asks for the home folder to place files it never writes in the extension.
const os = { homedir: () => '/', tmpdir: () => '/tmp', platform: () => 'browser' };
export const { homedir, tmpdir, platform } = os;
export default os;
