// In-memory fs for the browser studio: recorded files (globalThis.__GT_VFS) plus files the engine writes.
import { Buffer } from 'buffer';
const V = () => globalThis.__GT_VFS;
const mem = new Map();
const norm = (p) => String(p).replace(/\/+$/, '');
const missing = (p) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' });
export function existsSync(p) { p = norm(p); return p in V().files || p in V().dirs || mem.has(p); }
export function readFileSync(p, enc) {
  p = norm(p);
  const e = typeof enc === 'string' ? enc : enc?.encoding;
  if (mem.has(p)) { const d = mem.get(p); return typeof d === 'string' ? (e ? d : Buffer.from(d)) : (e ? Buffer.from(d).toString(e) : Buffer.from(d)); }
  if (!(p in V().files)) throw missing(p);
  const b = Buffer.from(V().files[p], 'base64');
  return e ? b.toString(e) : b;
}
export function readdirSync(p) { return (V().dirs[norm(p)] || []).slice(); }
export function statSync(p) { p = norm(p); if (!existsSync(p)) throw missing(p); const dir = p in V().dirs; return { isFile: () => !dir, isDirectory: () => dir, size: 0, mtimeMs: 0 }; }
export function writeFileSync(p, d) { mem.set(norm(p), d); }
export function mkdirSync() { }
export function rmSync(p) { mem.delete(norm(p)); }
export default { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync };
