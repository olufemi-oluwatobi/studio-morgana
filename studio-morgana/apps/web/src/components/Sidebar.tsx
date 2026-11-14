// The sidebar: fixed on wide screens, a drawer on phones. The wall, your pieces, and your projects
// (drop a piece on a project to pin it there).
import { memo, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useStore, createStore } from '../lib/store';
import { meStore, themeStore, toggleTheme, loadMe, toast } from '../lib/session';
import { linkHandler, navigate, parse, useLocation } from '../lib/router';
import { dragStore, loadWall, seedWall } from '../lib/wall';
import { createProject, loadProjects, pin, projectsStore } from '../lib/projects';
import { api, type Project } from '../lib/api';
import { Folder, Grid, Mine, Moon, Plus, Refresh, Sun, User, X } from './Icons';

export const drawerStore = createStore(false);

const ProjectLink = memo(function ProjectLink({ p, on }: { p: Project; on: boolean }) {
  const dragging = useStore(dragStore, (t) => !!t);
  const [hot, setHot] = useState(false);
  useEffect(() => { if (!dragging) setHot(false); }, [dragging]);
  const href = '/projects/' + p.id;
  const drop = {
    onDragOver: (e: DragEvent) => { if (dragStore.get()) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragEnter: (e: DragEvent) => { if (dragStore.get()) { e.preventDefault(); setHot(true); } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setHot(false); },
    onDrop: (e: DragEvent) => {
      const t = dragStore.get(); if (!t) return;
      e.preventDefault(); setHot(false); dragStore.set(null);
      void pin(p.id, t);
    },
  };
  return (
    <a className={'side-link project' + (on ? ' on' : '') + (hot ? ' hot' : '') + (dragging ? ' target' : '')} href={href} onClick={linkHandler(href)} {...drop}>
      {p.cover ? <img className="project-cover" src={p.cover} alt="" decoding="async" loading="lazy" /> : <span className="project-cover blank"><Folder size={14} /></span>}
      <span className="project-label">{p.name}</span>
      <span className="project-n">{p.count || ''}</span>
    </a>
  );
});

const NewProject = memo(function NewProject({ onDone }: { onDone(): void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = input.current?.value.trim();
    onDone();
    if (!name) return;
    const p = await createProject(name);
    if (p) navigate('/projects/' + p.id);
  };
  return (
    <form className="new-project" onSubmit={submit}>
      <input ref={input} placeholder="Project name" maxLength={80} aria-label="New project name"
        onBlur={() => void submit()} onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.value = ''; onDone(); } }} />
    </form>
  );
});

export const Sidebar = memo(function Sidebar() {
  const open = useStore(drawerStore, (s) => s);
  const me = useStore(meStore, (m) => m);
  const theme = useStore(themeStore, (t) => t);
  const projects = useStore(projectsStore, (s) => s.list);
  const [adding, setAdding] = useState(false);
  const loc = useLocation();
  const route = parse(loc);
  const scope = route.name === 'wall' ? route.scope : null;

  useEffect(() => { drawerStore.set(false); }, [loc]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') drawerStore.set(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  // whose projects: reload when you sign in or out
  const who = me?.user?.id ?? (me ? 'visitor' : null);
  useEffect(() => { if (who) void loadProjects(); }, [who]);

  const [refreshing, setRefreshing] = useState(false);
  const refreshShowcase = async () => {
    setRefreshing(true);
    try {
      const r = await api<{ results: { job: string; picked?: number; eligible?: number; error?: string }[] }>('/admin/jobs/run', { body: { job: 'showcase' } });
      const s = r.results[0];
      toast(s?.error ? `Showcase failed: ${s.error}` : `Showcase refreshed: ${s?.picked ?? 0} picked from ${s?.eligible ?? 0} public pieces`);
      void loadWall();
    } catch (e) { toast((e as Error).message); }
    setRefreshing(false);
  };
  const [seeding, setSeeding] = useState('');
  const seed = async () => {
    setSeeding('Seeding…');
    try { const n = await seedWall((d, t) => setSeeding(`Making ${Math.min(d + 1, t)} of ${t}…`)); toast(`Seeded the wall with ${n} featured pieces`); }
    catch (e) { toast((e as Error).message); }
    setSeeding('');
  };
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
          <a className={'side-link' + (scope?.kind === 'all' ? ' on' : '')} href="/" onClick={linkHandler('/')}><Grid /> Wall</a>
          <a className={'side-link' + (scope?.kind === 'mine' ? ' on' : '')} href="/mine" onClick={linkHandler('/mine')}><Mine /> Your pieces</a>
        </div>
        <section className="side-projects" aria-label="Projects">
          <div className="side-head">
            <span>Projects</span>
            <button className="icon-btn small" aria-label="New project" title="New project" onClick={() => setAdding(true)}><Plus size={14} /></button>
          </div>
          <div className="side-list">
            {adding && <NewProject onDone={() => setAdding(false)} />}
            {projects.map((p) => <ProjectLink key={p.id} p={p} on={scope?.kind === 'project' && scope.id === p.id} />)}
            {!projects.length && !adding && (
              <button className="side-empty" onClick={() => setAdding(true)}>Make a project, then drag pieces onto it</button>
            )}
          </div>
        </section>
        <div className="side-foot">
          <button className="side-link" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}>
            {theme === 'light' ? <Moon /> : <Sun />} {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          {me?.user?.role === 'admin' && (
            <button className="side-link" onClick={() => void refreshShowcase()} disabled={refreshing}><Refresh /> {refreshing ? 'Refreshing…' : 'Refresh showcase'}</button>
          )}
          {me?.user?.role === 'admin' && (
            <button className="side-link" onClick={() => void seed()} disabled={!!seeding}><Plus /> {seeding || 'Seed the wall'}</button>
          )}
          {me?.user ? (
            <div className="account">
              <span className="account-email" title={me.user.email}><User /> {me.user.email}</span>
              <button className="text-btn" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <a className="side-link" href="/auth" onClick={linkHandler('/auth')}><User /> Sign in</a>
          )}
        </div>
      </nav>
    </>
  );
});
