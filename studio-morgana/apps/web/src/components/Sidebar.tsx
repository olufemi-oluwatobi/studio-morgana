// The sidebar: fixed on wide screens, a drawer on phones.
import { memo, useEffect } from 'react';
import { useStore, createStore } from '../lib/store';
import { meStore, themeStore, toggleTheme, loadMe, toast } from '../lib/session';
import { linkHandler, navigate, useLocation } from '../lib/router';
import { loadWall, wallStore } from '../lib/wall';
import { api } from '../lib/api';
import { Grid, Moon, Sun, User, X, Sparkle } from './Icons';

export const drawerStore = createStore(false);

export const Sidebar = memo(function Sidebar() {
  const open = useStore(drawerStore, (s) => s);
  const me = useStore(meStore, (m) => m);
  const theme = useStore(themeStore, (t) => t);
  const view = useStore(wallStore, (w) => w.view);
  const loc = useLocation();
  const onWall = loc === '/' || loc.startsWith('/?');

  useEffect(() => { drawerStore.set(false); }, [loc]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') drawerStore.set(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const go = (v: 'all' | 'mine') => { if (!onWall) navigate('/'); void loadWall({ view: v }); drawerStore.set(false); };
  const signOut = async () => { await api('/auth/logout', { body: {} }); await loadMe(); void loadWall(); toast('Signed out'); };

  return (
    <>
      <div className={'scrim' + (open ? ' on' : '')} onClick={() => drawerStore.set(false)} aria-hidden="true" />
      <nav className={'side' + (open ? ' open' : '')} aria-label="Studio">
        <div className="side-top">
          <a className="wordmark" href="/" onClick={linkHandler('/')}>Morgana</a>
          <button className="icon-btn side-close" aria-label="Close menu" onClick={() => drawerStore.set(false)}><X /></button>
        </div>
        <div className="side-nav">
          <button className={'side-link' + (onWall && view === 'all' ? ' on' : '')} onClick={() => go('all')}><Grid /> Wall</button>
          <button className={'side-link' + (onWall && view === 'mine' ? ' on' : '')} onClick={() => go('mine')}><Sparkle /> Your pieces</button>
        </div>
        <div className="side-foot">
          <button className="side-link" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}>
            {theme === 'light' ? <Moon /> : <Sun />} {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          {me?.user ? (
            <div className="account">
              <span className="account-email" title={me.user.email}><User /> {me.user.email}</span>
              <button className="text-btn" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <a className="side-link" href="/auth" onClick={linkHandler('/auth')}><User /> Sign in</a>
          )}
          {me?.ai === 'local' && <p className="side-note">Offline generator: AI_MODE is local.</p>}
        </div>
      </nav>
    </>
  );
});
