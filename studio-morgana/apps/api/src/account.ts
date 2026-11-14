// Accounts: sign up, sign in, sign out, confirm email, forgot and reset password.
import { Hono } from 'hono';
import type { App } from './env';
import { adoptVisitorWork, checkPassword, endSession, hashPassword, makeToken, startSession, useToken, validEmail, validPassword } from './auth';
import { resetMail, sendEmail, verifyMail } from './email';
import { fail, id, now, str } from './util';
import { labOn } from './lab';

export const account = new Hono<App>();

account.get('/me', async (c) => {
  const who = c.get('who');
  let user = null;
  if (who.userId) user = await c.env.DB.prepare('SELECT id, email, role, verified FROM users WHERE id = ?').bind(who.userId).first();
  return c.json({ user, email: !!c.env.RESEND_API_KEY, features: { lab: labOn(c.env, who) } }, 200, { 'cache-control': 'no-store' });
});

account.post('/auth/signup', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  const email = validEmail(str(b.email, 'email', 254));
  const password = validPassword(b.password);
  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) fail(409, 'there is already an account with that email; sign in instead');
  const uid = id();
  await c.env.DB.prepare('INSERT INTO users (id, email, pass, created) VALUES (?, ?, ?, ?)').bind(uid, email, await hashPassword(password), now()).run();
  await adoptVisitorWork(c.env, c.get('who').visitor, uid);
  await startSession(c, uid);
  const token = await makeToken(c.env, uid, 'verify', 24);
  c.executionCtx.waitUntil(sendEmail(c.env, verifyMail(c.env, email, token)));
  return c.json({ user: { id: uid, email, role: 'user', verified: 0 } });
});

account.post('/auth/login', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  const email = validEmail(str(b.email, 'email', 254));
  const password = typeof b.password === 'string' ? b.password : '';
  const u = await c.env.DB.prepare('SELECT id, email, pass, role, verified FROM users WHERE email = ?').bind(email).first<{ id: string; email: string; pass: string; role: string; verified: number }>();
  // the same work and the same answer whether or not the email exists
  const ok = await checkPassword(password, u?.pass ?? 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  if (!u || !ok) fail(401, 'that email and password do not match');
  await adoptVisitorWork(c.env, c.get('who').visitor, u.id);
  await startSession(c, u.id);
  return c.json({ user: { id: u.id, email: u.email, role: u.role, verified: u.verified } });
});

account.post('/auth/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

account.post('/auth/verify', async (c) => {
  const b = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const uid = await useToken(c.env, str(b.token, 'token', 200), 'verify');
  await c.env.DB.prepare('UPDATE users SET verified = 1 WHERE id = ?').bind(uid).run();
  return c.json({ ok: true });
});

account.post('/auth/forgot', async (c) => {
  const b = await c.req.json<{ email?: string }>().catch(() => ({} as { email?: string }));
  const email = validEmail(str(b.email, 'email', 254));
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (u) {
    const token = await makeToken(c.env, u.id, 'reset', 1);
    c.executionCtx.waitUntil(sendEmail(c.env, resetMail(c.env, email, token)));
  }
  // the same answer either way, so this cannot be used to find out who has an account
  return c.json({ ok: true, email: !!c.env.RESEND_API_KEY });
});

account.post('/auth/reset', async (c) => {
  const b = await c.req.json<{ token?: string; password?: string }>().catch(() => ({} as { token?: string; password?: string }));
  const password = validPassword(b.password);
  const uid = await useToken(c.env, str(b.token, 'token', 200), 'reset');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET pass = ?, verified = 1 WHERE id = ?').bind(await hashPassword(password), uid),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid),
  ]);
  await startSession(c, uid);
  return c.json({ ok: true });
});
