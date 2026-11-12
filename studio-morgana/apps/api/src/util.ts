import { HTTPException } from 'hono/http-exception';

export const now = () => Date.now();
export const today = () => new Date().toISOString().slice(0, 10);

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
export function id(len = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const x of b) s += ALPHA[x % 36];
  return s;
}

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function sha256hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

export function str(v: unknown, name: string, max = 10_000, min = 1): string {
  if (typeof v !== 'string') fail(400, `${name} is required`);
  const s = v.trim();
  if (s.length < min) fail(400, `${name} is too short`);
  if (s.length > max) fail(400, `${name} is too long`);
  return s;
}

// the title a source gives itself: "create a card called goku" → "goku"
export function titleOf(source: string, fallback = 'Untitled'): string {
  const m = source.match(/create (?:a|an) (?:card|canvas|stage|video|room) called ([^,.\n]+?)(?=\s+from\b|\s+seed\b|,|\.|\n|$)/i);
  const t = (m ? m[1] : fallback).trim().replace(/[-_]+/g, ' ');
  return t.length > 80 ? t.slice(0, 80) : t;
}
