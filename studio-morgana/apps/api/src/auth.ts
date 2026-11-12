// Email + password accounts, session cookies, and anonymous visitors.
// Passwords: PBKDF2-SHA-256, 100,000 iterations (the most Workers' Web Crypto allows), 16-byte salt.
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { App, Env, Who } from './env';
import { b64, unb64, id, now, sha256hex, today, fail } from './util';

const ITER = 100_000;
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'ms_session';
export const VISITOR_COOKIE = 'ms_visitor';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !it || !salt || !hash) return false;
  return same(await derive(password, unb64(salt), Number(it)), unb64(hash));
}

export function validEmail(s: string): string {
  const e = s.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, 'that email address does not look right');
  return e;
}
export function validPassword(s: unknown): string {
  if (typeof s !== 'string' || s.length < 8) fail(400, 'passwords need at least 8 characters');
  if (s.length > 200) fail(400, 'that password is too long');
  return s;
}

const secure = (c: Context) => new URL(c.req.url).protocol === 'https:';

export async function startSession(c: Context<App>, userId: string): Promise<void> {
  const token = id(32);
  const t = now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), userId, t, t + SESSION_DAYS * 86400_000).run();
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function endSession(c: Context<App>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

// every request gets a "who": the signed-in user if any, and always a visitor id (cookie) for anonymous work
export const identify: MiddlewareHandler<App> = async (c, next) => {
  let visitor = getCookie(c, VISITOR_COOKIE);
  if (!visitor || !/^[a-z0-9]{16,40}$/.test(visitor)) {
    visitor = id(20);
    setCookie(c, VISITOR_COOKIE, visitor, { httpOnly: true, secure: secure(c), sameSite: 'Lax', path: '/', maxAge: 365 * 86400 });
  }
  let who: Who = { userId: null, email: null, role: null, visitor, owner: 'a:' + visitor };
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const row = await c.env.DB.prepare(
      'SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ?',
    ).bind(await sha256hex(token), now()).first<{ id: string; email: string; role: 'user' | 'admin' }>();
    if (row) who = { userId: row.id, email: row.email, role: row.role, visitor, owner: 'u:' + row.id };
  }
  c.set('who', who);
  await next();
};

export function requireUser(c: Context<App>): Who {
  const who = c.get('who');
  if (!who.userId) fail(401, 'sign in first');
  return who;
}
export function requireAdmin(c: Context<App>): Who {
  const who = requireUser(c);
  if (who.role !== 'admin') fail(403, 'admins only');
  return who;
}

// daily limits per person (signed in) or per visitor (anonymous)
export async function spend(env: Env, who: Who, kind: 'generate' | 'command', n = 1): Promise<{ used: number; limit: number }> {
  const key = kind === 'generate' ? 'GENERATIONS' : 'COMMANDS';
  const limit = Number((who.userId ? env[`USER_DAILY_${key}` as keyof Env] : env[`ANON_DAILY_${key}` as keyof Env]) || (who.userId ? 200 : 12));
  const day = today();
  const row = await env.DB.prepare(
    `INSERT INTO usage (subject, day, kind, count) VALUES (?, ?, ?, ?)
     ON CONFLICT (subject, day, kind) DO UPDATE SET count = count + excluded.count
     RETURNING count`,
  ).bind(who.owner, day, kind, n).first<{ count: number }>();
  const used = row?.count ?? n;
  if (used > limit) {
    await env.DB.prepare('UPDATE usage SET count = count - ? WHERE subject = ? AND day = ? AND kind = ?').bind(n, who.owner, day, kind).run();
    fail(429, who.userId
      ? `you have reached today's limit (${limit}); it resets at midnight UTC`
      : `you have used today's free ${kind === 'generate' ? 'generations' : 'edits'}; sign in to keep going`);
  }
  return { used, limit };
}

// anonymous work follows you into your account
export async function adoptVisitorWork(env: Env, visitor: string, userId: string): Promise<void> {
  await env.DB.prepare('UPDATE pieces SET owner = ? WHERE owner = ?').bind('u:' + userId, 'a:' + visitor).run();
}

export async function makeToken(env: Env, userId: string, kind: 'verify' | 'reset', hours: number): Promise<string> {
  const token = id(32);
  await env.DB.prepare('INSERT INTO tokens (id, user_id, kind, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), userId, kind, now() + hours * 3600_000).run();
  return token;
}
export async function useToken(env: Env, token: string, kind: 'verify' | 'reset'): Promise<string> {
  const h = await sha256hex(token);
  const row = await env.DB.prepare('SELECT user_id FROM tokens WHERE id = ? AND kind = ? AND expires > ?').bind(h, kind, now()).first<{ user_id: string }>();
  if (!row) fail(400, 'that link has expired or was already used');
  await env.DB.prepare('DELETE FROM tokens WHERE id = ?').bind(h).run();
  return row.user_id;
}
