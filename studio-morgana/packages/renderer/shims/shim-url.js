export const fileURLToPath = (u) => decodeURIComponent(String(u).replace(/^file:\/\//, ''));
export const pathToFileURL = (p) => ({ href: 'file://' + p, toString() { return this.href; } });
export default { fileURLToPath, pathToFileURL };
