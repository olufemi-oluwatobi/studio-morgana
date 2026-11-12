// Email through Resend. Off until RESEND_API_KEY is set: then messages are logged (the link is in the Worker log).
import type { Env } from './env';

export interface Mail { to: string; subject: string; text: string; html?: string }

export async function sendEmail(env: Env, m: Mail): Promise<{ sent: boolean }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email off] to=${m.to} subject="${m.subject}"\n${m.text}`);
    return { sent: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'Studio Morgana <studio@example.com>', to: [m.to], subject: m.subject, text: m.text, html: m.html }),
  });
  if (!res.ok) {
    console.error('resend failed', res.status, await res.text().catch(() => ''));
    return { sent: false };
  }
  return { sent: true };
}

const link = (env: Env, path: string) => (env.APP_URL || '').replace(/\/$/, '') + path;

export function verifyMail(env: Env, to: string, token: string): Mail {
  const url = link(env, `/auth/verify?token=${token}`);
  return { to, subject: 'Confirm your email for Studio Morgana', text: `Confirm your email address:\n${url}\n\nThe link works for 24 hours.`,
    html: `<p>Confirm your email address for Studio Morgana:</p><p><a href="${url}">Confirm email</a></p><p>The link works for 24 hours.</p>` };
}
export function resetMail(env: Env, to: string, token: string): Mail {
  const url = link(env, `/auth/reset?token=${token}`);
  return { to, subject: 'Reset your Studio Morgana password', text: `Choose a new password:\n${url}\n\nThe link works for 1 hour. If you did not ask for this, ignore this email.`,
    html: `<p>Choose a new password for Studio Morgana:</p><p><a href="${url}">Reset password</a></p><p>The link works for 1 hour. If you did not ask for this, ignore this email.</p>` };
}
