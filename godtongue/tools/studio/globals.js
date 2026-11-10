import { Buffer } from 'buffer';
export { Buffer };
export const process = { env: {}, cwd: () => (globalThis.__GT_VFS && globalThis.__GT_VFS.root) || '/', platform: 'browser' };
