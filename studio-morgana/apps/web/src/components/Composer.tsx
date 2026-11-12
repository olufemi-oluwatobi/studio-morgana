// The composer: a bar that opens into a panel. Type, add references (drop a piece, upload or paste an image), Make.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useStore } from '../lib/store';
import { addPieceRef, addUpload, composerStore, generate, removeRef, wallStore, type Ref } from '../lib/wall';
import { ArrowUp, ImageIcon, Sparkle, X } from './Icons';

// phones get a shorter placeholder, so it never wraps
const narrowQ = typeof window === 'undefined' ? null : matchMedia('(max-width: 560px)');
const subNarrow = (f: () => void) => { narrowQ?.addEventListener('change', f); return () => narrowQ?.removeEventListener('change', f); };
const useNarrow = () => useSyncExternalStore(subNarrow, () => !!narrowQ?.matches, () => false);

const RefChip = memo(function RefChip({ r }: { r: Ref }) {
  const label = r.kind === 'piece' ? r.title : r.name;
  return (
    <span className={'ref' + (r.kind === 'upload' && r.uploading ? ' busy' : '')} title={label}>
      {r.thumb ? <img src={r.thumb} alt="" decoding="async" /> : <span className="ref-blank" />}
      <button className="ref-x" aria-label={`Remove reference ${label}`} onClick={() => removeRef(r)}><X size={10} /></button>
    </span>
  );
});

export const Composer = memo(function Composer() {
  const open = useStore(composerStore, (c) => c.open);
  const text = useStore(composerStore, (c) => c.text);
  const refs = useStore(composerStore, (c) => c.refs);
  const busy = useStore(composerStore, (c) => c.busy);
  const project = useStore(wallStore, (w) => (w.scope.kind === 'project' ? w.project?.name ?? null : null));
  const narrow = useNarrow();
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

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
      <div className="composer-row">
        <span className="composer-mark" aria-hidden="true"><Sparkle size={16} /></span>
        <label className="sr-only" htmlFor="prompt">Describe a piece</label>
        <textarea id="prompt" ref={ta} rows={1} value={text} placeholder={busy ? 'Making…' : project ? (narrow ? `Make for ${project}` : `Make something for ${project}`) : narrow ? 'Describe a piece' : 'Describe what to make'}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={(e) => composerStore.set((c) => ({ ...c, text: e.target.value }))} />
        <button className="icon-btn" aria-label="Add a reference image" onClick={() => file.current?.click()}><ImageIcon size={18} /></button>
        <button className="make" onClick={() => void generate()} disabled={busy || !text.trim()} aria-label="Make">
          {busy ? <span className="spin" aria-hidden="true" /> : <ArrowUp size={14} />}
          <span className="make-label">Make</span>
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden
          onChange={(e) => { for (const f of e.target.files || []) void addUpload(f); e.target.value = ''; }} />
      </div>
      <div className="composer-more" aria-hidden={!open}>
        <div className="composer-more-inner">
          <div className="refs">
            {refs.map((r) => <RefChip key={r.kind === 'piece' ? r.id : r.key} r={r} />)}
            <span className="refs-hint">{refs.length ? `${refs.length} of 4 references` : 'Drag a piece here, or add an image, to use it as a reference'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
