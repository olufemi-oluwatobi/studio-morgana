// Sign in, create an account, forgotten password, reset, confirm email.
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { loadMe, toast } from '../lib/session';
import { linkHandler, navigate } from '../lib/router';
import { loadWall } from '../lib/wall';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'verify';

export default function Auth({ mode, token }: { mode: Mode; token: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { setError(null); setDone(null); }, [mode]);
  useEffect(() => {
    if (mode !== 'verify' || !token) return;
    api('/auth/verify', { body: { token } }).then(() => setDone('Your email is confirmed.')).catch((e) => setError((e as Error).message));
  }, [mode, token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'signin' || mode === 'signup') {
        await api(mode === 'signin' ? '/auth/login' : '/auth/signup', { body: { email, password } });
        await loadMe(); void loadWall();
        toast(mode === 'signin' ? 'Signed in' : 'Account created');
        navigate('/');
      } else if (mode === 'forgot') {
        const r = await api<{ email: boolean }>('/auth/forgot', { body: { email } });
        setDone(r.email ? 'If there is an account for that address, a reset link is on its way.' : 'Email is not switched on yet: ask an admin for a reset link (it is in the server log).');
      } else if (mode === 'reset') {
        await api('/auth/reset', { body: { token, password } });
        await loadMe();
        toast('Password changed');
        navigate('/');
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const title = { signin: 'Sign in', signup: 'Create an account', forgot: 'Forgot your password', reset: 'Choose a new password', verify: 'Confirm your email' }[mode];
  return (
    <div className="page auth-page">
      <form className="auth" onSubmit={submit}>
        <a className="wordmark" href="/" onClick={linkHandler('/')}>Morgana</a>
        <h1>{title}</h1>
        {(mode === 'signin' || mode === 'signup') && (
          <div className="seg wide" role="tablist">
            <a role="tab" aria-selected={mode === 'signin'} href="/auth/signin" onClick={linkHandler('/auth/signin')}>Sign in</a>
            <a role="tab" aria-selected={mode === 'signup'} href="/auth/signup" onClick={linkHandler('/auth/signup')}>Create account</a>
          </div>
        )}
        {mode !== 'verify' && mode !== 'reset' && (
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        )}
        {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
          <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signin' ? 1 : 8}
            value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {done && <p className="form-done" role="status">{done}</p>}
        {mode !== 'verify' && !done && <button className="btn primary" disabled={busy}>{busy ? 'One moment…' : title}</button>}
        <div className="auth-links">
          {mode === 'signin' && <a href="/auth/forgot" onClick={linkHandler('/auth/forgot')}>Forgot your password?</a>}
          {(mode === 'forgot' || mode === 'verify' || mode === 'reset') && <a href="/auth/signin" onClick={linkHandler('/auth/signin')}>Back to sign in</a>}
          <a href="/" onClick={linkHandler('/')}>Back to the wall</a>
        </div>
        {mode === 'signup' && <p className="fine">Anything you made before signing up moves into your account.</p>}
      </form>
    </div>
  );
}
