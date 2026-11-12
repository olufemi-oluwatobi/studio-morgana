// "Pin" in the editor: tick the projects this piece is on, or make a new project with it.
import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { createProject, loadProjects, pin, projectsStore, unpin } from '../lib/projects';
import { Check, Pin, Plus } from './Icons';

export const PinMenu = memo(function PinMenu({ piece, pinnedIn, onChange, disabled }: {
  piece: { id: string; title: string; src: string | null }; pinnedIn: readonly string[]; onChange(ids: string[]): void; disabled?: boolean;
}) {
  const projects = useStore(projectsStore, (s) => s.list);
  const loaded = useStore(projectsStore, (s) => s.loaded);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && !loaded) void loadProjects(); }, [open, loaded]);
  useEffect(() => { if (naming) input.current?.focus(); }, [naming]);
  // close on a click elsewhere or Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setNaming(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setNaming(false); } };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const toggle = async (id: string) => {
    if (pinnedIn.includes(id)) { if (await unpin(id, piece.id)) onChange(pinnedIn.filter((x) => x !== id)); }
    else if (await pin(id, piece, { quiet: true })) onChange([...pinnedIn, id]);
  };
  const make = async (e: FormEvent) => {
    e.preventDefault();
    const name = input.current?.value.trim(); if (!name) return;
    setNaming(false);
    const p = await createProject(name, piece);
    if (p) onChange([...pinnedIn, p.id]);
  };

  const n = pinnedIn.length;
  return (
    <div className="menu-wrap" ref={box}>
      <button className={'btn' + (n ? ' pinned' : '')} aria-haspopup="menu" aria-expanded={open} disabled={disabled} aria-label={n ? 'Pinned to projects' : 'Pin to a project'} onClick={() => setOpen((o) => !o)}>
        <Pin size={16} w={n ? 'fill' : undefined} /><span className="btn-label">{n ? `Pinned${n > 1 ? ` · ${n}` : ''}` : 'Pin'}</span>
      </button>
      {open && (
        <div className="menu pin-menu" role="menu" aria-label="Pin to a project">
          <div className="menu-label">Pin to a project</div>
          {projects.map((p) => {
            const on = pinnedIn.includes(p.id);
            return (
              <button key={p.id} role="menuitemcheckbox" aria-checked={on} onClick={() => void toggle(p.id)}>
                <span className={'check' + (on ? ' on' : '')}>{on && <Check size={12} />}</span>
                <span className="menu-text">{p.name}</span>
              </button>
            );
          })}
          {loaded && !projects.length && !naming && <div className="menu-empty">No projects yet</div>}
          {naming ? (
            <form className="menu-form" onSubmit={make}>
              <input ref={input} placeholder="Project name" maxLength={80} aria-label="New project name" />
            </form>
          ) : (
            <button role="menuitem" onClick={() => setNaming(true)}><span className="check plus"><Plus size={12} /></span>New project</button>
          )}
        </div>
      )}
    </div>
  );
});
