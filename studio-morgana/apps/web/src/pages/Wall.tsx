// Page 1: the wall. Fixed header (composer + type tabs), then the pieces: everything (yours, then featured),
// only yours, or one project's pins.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { TABS, draftsStore, hiddenStore, loadWall, wallStore, type Tab, type Tile } from '../lib/wall';
import { deleteProject, projectsStore, renameProject } from '../lib/projects';
import type { Scope } from '../lib/router';
import { Composer } from '../components/Composer';
import { Masonry } from '../components/Masonry';
import { drawerStore } from '../components/Sidebar';
import { Menu, Trash } from '../components/Icons';

const Tabs = memo(function Tabs() {
  const tab = useStore(wallStore, (w) => w.tab);
  return (
    <div className="tabs" role="tablist" aria-label="Kinds of piece">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} disabled={t.soon} className={'tab' + (tab === t.id ? ' on' : '') + (t.soon ? ' soon' : '')}
          title={t.soon ? `${t.label} are coming soon` : undefined}
          onClick={() => { if (!t.soon && t.id !== tab) void loadWall({ tab: t.id as Tab }); }}>
          {t.label}{t.soon && <span className="soon-tag">Soon</span>}
        </button>
      ))}
    </div>
  );
});

// a project's name (click to rename), how many pieces, and delete
const ProjectHead = memo(function ProjectHead({ id }: { id: string }) {
  const fromList = useStore(projectsStore, (s) => s.list.find((p) => p.id === id) ?? null);
  const loaded = useStore(wallStore, (w) => w.project);
  const name = fromList?.name ?? loaded?.name ?? '';
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  const save = (e?: FormEvent) => { e?.preventDefault(); const v = input.current?.value ?? ''; setEditing(false); void renameProject(id, v); };
  return (
    <div className="project-head">
      {editing ? (
        <form onSubmit={save} className="project-name-form">
          <input ref={input} className="project-name-input" defaultValue={name} aria-label="Project name" maxLength={80}
            onBlur={() => save()} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
        </form>
      ) : (
        <h1 className="project-name"><button onClick={() => setEditing(true)} title="Rename">{name || ' '}</button></h1>
      )}
      {fromList && <span className="project-count">{fromList.count} {fromList.count === 1 ? 'piece' : 'pieces'}</span>}
      <button className="icon-btn" aria-label="Delete this project" title="Delete project" onClick={() => void deleteProject(id)}><Trash size={18} /></button>
    </div>
  );
});

export default function Wall({ scope }: { scope: Scope }) {
  const pieces = useStore(wallStore, (w) => w.pieces);
  const featured = useStore(wallStore, (w) => w.featured);
  const tab = useStore(wallStore, (w) => w.tab);
  const loading = useStore(wallStore, (w) => w.loading);
  const error = useStore(wallStore, (w) => w.error);
  const hasMore = useStore(wallStore, (w) => w.next != null);
  const drafts = useStore(draftsStore, (d) => d);
  const hidden = useStore(hiddenStore, (h) => h);

  // follow the address: /, /mine, /projects/:id
  const key = scope.kind === 'project' ? 'p:' + scope.id : scope.kind;
  useEffect(() => { void loadWall({ scope }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Tile[]>(() => {
    const fits = (t: Tile) => tab === 'all' || t.type === tab || (t.type == null && t.state !== 'ready');
    const seen = new Set<string>();
    const out: Tile[] = [];
    const add = (t: Tile) => { const k = t.id ?? t.key; if (seen.has(k) || (t.id && hidden.has(t.id)) || !fits(t)) return; seen.add(k); out.push(t); };
    drafts.forEach(add);
    pieces.forEach(add);
    featured.forEach(add);
    return out;
  }, [drafts, pieces, featured, tab, hidden]);

  const more = useCallback(() => { void loadWall({ more: true }); }, []);
  const empty = scope.kind === 'project' ? 'Nothing pinned yet. Drag a piece onto this project in the sidebar, use Pin in the editor, or make one here.'
    : scope.kind === 'mine' ? 'Nothing here yet. Describe a piece above and press Make.' : 'Nothing in this tab yet.';

  return (
    <div className="page wall-page">
      <header className="bar">
        <div className="bar-row">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => drawerStore.set(true)}><Menu /></button>
          <Composer />
        </div>
        <Tabs />
      </header>
      <main className="wall">
        {scope.kind === 'project' && <ProjectHead id={scope.id} />}
        {error && <p className="note">Could not load the wall: {error}</p>}
        {!items.length && !loading && !error && <p className="note">{empty}</p>}
        <Masonry items={items} onEnd={hasMore ? more : undefined} />
      </main>
    </div>
  );
}
