// The composer: a bar that opens into a panel. Type, add references (drop a piece, upload or paste an image), Make.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useStore } from '../lib/store';
import { addAsset, addPieceRef, addUpload, assetsStore, composerStore, forgetAsset, generate, loadAssets, removeRef, toggleRole, wallStore, type Ref } from '../lib/wall';
import { ArrowUp, Plus, X } from './Icons';
import { FORMATS } from '../lib/formats.gen';

// phones get a shorter placeholder, so it never wraps
const narrowQ = typeof window === 'undefined' ? null : matchMedia('(max-width: 560px)');
const subNarrow = (f: () => void) => { narrowQ?.addEventListener('change', f); return () => narrowQ?.removeEventListener('change', f); };
const useNarrow = () => useSyncExternalStore(subNarrow, () => !!narrowQ?.matches, () => false);

const RefChip = memo(function RefChip({ r }: { r: Ref }) {
  const label = r.kind === 'piece' ? r.title : r.name;
  return (
    <span className={'ref' + (r.kind === 'upload' && r.uploading ? ' busy' : '')} title={label}>
      {r.thumb ? <img src={r.thumb} alt="" decoding="async" /> : <span className="ref-blank" />}
      <button className="ref-role" title={r.kind === 'piece' ? 'A reference: its look is matched' : r.role === 'use' ? 'An asset: it goes in the piece. Click to make it a reference.' : 'A reference: its look is matched, it is never printed. Click to make it an asset.'}
        disabled={r.kind === 'piece'} onClick={() => toggleRole(r)}>{r.kind === 'piece' || r.role === 'style' ? 'Ref' : 'Asset'}</button>
      <button className="ref-x" aria-label={`Remove reference ${label}`} onClick={() => removeRef(r)}><X size={10} /></button>
    </span>
  );
});

export const Composer = memo(function Composer() {
  const open = useStore(composerStore, (c) => c.open);
  const text = useStore(composerStore, (c) => c.text);
  const refs = useStore(composerStore, (c) => c.refs);
  const busy = useStore(composerStore, (c) => c.busy);
  const format = useStore(composerStore, (c) => c.format);
  const project = useStore(wallStore, (w) => (w.scope.kind === 'project' ? w.project?.name ?? null : null));
  const narrow = useNarrow();
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const role = useRef<'use' | 'style'>('style');
  const [menu, setMenu] = useState(false);
  const assets = useStore(assetsStore, (a) => a);
  useEffect(() => { if (menu && assets === null) void loadAssets(); }, [menu, assets]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!t.closest('.add-menu') && !t.closest('.add')) setMenu(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const pick = (r: 'use' | 'style') => { role.current = r; setMenu(false); file.current?.click(); };

  const setOpen = useCallback((v: boolean) => composerStore.set((c) => (c.open === v ? c : { ...c, open: v })), []);

  // grow with the text, up to six lines
  useLayoutEffect(() => {
    const t = ta.current; if (!t) return;
    t.style.height = '0px';
    t.style.height = Math.min(t.scrollHeight, 200) + 'px';
  }, [text, open]);

  useEffect(() => { if (open) ta.current?.focus({ preventScroll: true }); }, [open]);

  // close when you click elsewhere, if there is nothing in it
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      const c = composerStore.get();
      if (!c.text.trim() && !c.refs.length) setOpen(false);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open, setOpen]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void generate(); }
    if (e.key === 'Escape') { setOpen(false); ta.current?.blur(); }
  };
  const onPaste = (e: ClipboardEvent) => {
    for (const it of e.clipboardData.items) if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); void addUpload(f); } }
  };
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-morgana-piece') || e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  };
  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-morgana-piece');
    if (raw) { e.preventDefault(); try { addPieceRef(JSON.parse(raw)); } catch { /* not ours */ } return; }
    if (e.dataTransfer.files.length) { e.preventDefault(); for (const f of e.dataTransfer.files) void addUpload(f); }
  };

  return (
    <div ref={box} className={'composer' + (open ? ' open' : '') + (busy ? ' busy' : '')} onDragOver={onDragOver} onDrop={onDrop} onPaste={onPaste}>
      {refs.length > 0 && (
        <div className="refs in-input">
          {refs.map((r) => <RefChip key={r.kind === 'piece' ? r.id : r.key} r={r} />)}
          <span className="refs-hint">{refs.length} of 4</span>
        </div>
      )}
      <div className="composer-row">
        <button className="add" aria-label="Add an asset or a reference" aria-expanded={menu} title="Add an asset or a reference, or drop a piece here" disabled={refs.length >= 4} onClick={() => setMenu((m) => !m)}><Plus size={18} /></button>
        {menu && (
          <div className="add-menu" role="menu">
            <button role="menuitem" onClick={() => pick('use')}><b>Asset</b><span>Goes in the piece: a logo, a photo, an SVG. Saved for next time.</span></button>
            <button role="menuitem" onClick={() => pick('style')}><b>Reference</b><span>A look to match. Never printed.</span></button>
            {!!assets?.length && (
              <div className="add-assets">
                <span>Your assets</span>
                <div>{assets.map((a) => (
                  <span key={a.key} className="add-asset">
                    <button title={`Add ${a.name}`} onClick={() => { addAsset(a); setMenu(false); }}><img src={a.url} alt={a.label || a.name} /></button>
                    <button className="add-asset-x" aria-label={`Remove ${a.name} from your assets`} onClick={() => void forgetAsset(a)}><X size={9} /></button>
                  </span>
                ))}</div>
              </div>
            )}
          </div>
        )}
        <label className="sr-only" htmlFor="prompt">Describe a piece</label>
        <textarea id="prompt" ref={ta} rows={1} value={text} placeholder={busy ? 'Making…' : project ? (narrow ? `Make for ${project}` : `Make something for ${project}`) : narrow ? 'Describe a piece' : 'Describe what to make'}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={(e) => composerStore.set((c) => ({ ...c, text: e.target.value }))} />
        <button className="make" onClick={() => void generate()} disabled={busy || !text.trim()} aria-label="Make">
          {busy ? <span className="spin" aria-hidden="true" /> : <ArrowUp size={14} />}
          <span className="make-label">Make</span>
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden
          onChange={(e) => { for (const f of e.target.files || []) void addUpload(f, role.current); e.target.value = ''; }} />
      </div>
      <div className="composer-more" aria-hidden={!open}>
        <div className="composer-more-inner">
          <div className="refs">
            <label className="format-pick">
              <span>Format</span>
              <select value={format} onChange={(e) => composerStore.set((c) => ({ ...c, format: e.target.value }))}>
                <option value="auto">Auto (from your words)</option>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.ratio}</option>)}
              </select>
            </label>
            <span className="refs-hint">{refs.length ? 'Drag more pieces here, or press + for an asset or a reference' : 'Press + to add an asset (goes in the piece) or a reference (a look to match), or drag a piece here'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
