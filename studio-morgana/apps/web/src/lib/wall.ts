// The wall's state and actions: tabs, pieces, generating (skeletons → renders), references, removing.
import { api, ApiError, streamLines, type Category, type PieceCard, type PieceFile, type Version } from './api';
import { createStore } from './store';
import { meStore, toast } from './session';
import { commit, encodePreview, render } from '../render/pipeline';
import { PRIORITY } from '../render/host';

export type Tab = 'all' | Category;
export const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'cards', label: 'Cards' }, { id: 'posts', label: 'Posts' }, { id: 'scenes', label: 'Scenes' }, { id: 'videos', label: 'Videos' },
];

export interface Tile {
  key: string; id: string | null; title: string; category: Category | null; mine: boolean;
  state: 'writing' | 'rendering' | 'ready' | 'failed';
  src: string | null; w: number | null; h: number | null; video: string | null;
}
const fromCard = (p: PieceCard): Tile => ({
  key: p.id, id: p.id, title: p.title, category: p.category, mine: p.mine, state: 'ready', src: p.sm, w: p.w, h: p.h, video: p.video,
});

interface WallState { tab: Tab; view: 'all' | 'mine'; mine: Tile[]; featured: Tile[]; next: number | null; loading: boolean; error: string | null }
export const wallStore = createStore<WallState>({ tab: 'all', view: 'all', mine: [], featured: [], next: 0, loading: false, error: null });
export const draftsStore = createStore<Tile[]>([]);

// pieces this browser has put away (featured ones cannot be deleted, only hidden here)
const HIDDEN_KEY = 'morgana-hidden';
const readHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };
export const hiddenStore = createStore<ReadonlySet<string>>(new Set(typeof window === 'undefined' ? [] : readHidden()));
const saveHidden = (s: ReadonlySet<string>) => { hiddenStore.set(s); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* private window */ } };

let loadCtl: AbortController | null = null;
export async function loadWall(opts: { tab?: Tab; view?: 'all' | 'mine'; more?: boolean } = {}) {
  const s = wallStore.get();
  const tab = opts.tab ?? s.tab, view = opts.view ?? s.view;
  if (opts.more && (s.loading || s.next == null)) return;
  loadCtl?.abort();
  const ctl = (loadCtl = new AbortController());
  const cursor = opts.more ? s.next ?? 0 : 0;
  wallStore.set((w) => ({ ...w, tab, view, loading: true, error: null, ...(opts.more ? {} : { next: 0 }) }));
  try {
    const q = new URLSearchParams({ cursor: String(cursor), limit: '30' });
    if (tab !== 'all') q.set('cat', tab);
    const r = await api<{ mine: PieceCard[]; featured: PieceCard[]; next: number | null }>('/wall?' + q, { signal: ctl.signal });
    wallStore.set((w) => ({
      ...w, loading: false, next: r.next,
      mine: opts.more ? w.mine : r.mine.map(fromCard),
      featured: opts.more ? [...w.featured, ...r.featured.map(fromCard)] : r.featured.map(fromCard),
    }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    wallStore.set((w) => ({ ...w, loading: false, error: (e as Error).message }));
  }
}

// ── composer
export type Ref = { kind: 'piece'; id: string; title: string; thumb: string | null } | { kind: 'upload'; key: string; name: string; thumb: string; uploading?: boolean };
interface ComposerState { open: boolean; text: string; refs: Ref[]; busy: boolean }
export const composerStore = createStore<ComposerState>({ open: false, text: '', refs: [], busy: false });
const refKey = (r: Ref) => (r.kind === 'piece' ? 'p:' + r.id : 'u:' + r.key);

export function addPieceRef(t: { id: string; title: string; thumb: string | null }) {
  composerStore.set((c) => c.refs.some((r) => r.kind === 'piece' && r.id === t.id) || c.refs.length >= 4 ? { ...c, open: true }
    : { ...c, open: true, refs: [...c.refs, { kind: 'piece', ...t }] });
}
export function removeRef(r: Ref) {
  composerStore.set((c) => ({ ...c, refs: c.refs.filter((x) => refKey(x) !== refKey(r)) }));
}
export async function addUpload(file: File) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast('Use a PNG, JPEG, WebP or SVG image'); return; }
  if (composerStore.get().refs.length >= 4) { toast('Up to four references'); return; }
  const local = URL.createObjectURL(file), tmp = 'tmp-' + Math.random().toString(36).slice(2);
  composerStore.set((c) => ({ ...c, open: true, refs: [...c.refs, { kind: 'upload', key: tmp, name: file.name, thumb: local, uploading: true }] }));
  try {
    const u = await api<{ key: string; name: string; url: string }>('/uploads', { method: 'POST', raw: file, headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) } });
    composerStore.set((c) => ({ ...c, refs: c.refs.map((r) => (r.kind === 'upload' && r.key === tmp ? { kind: 'upload', key: u.key, name: u.name, thumb: u.url } : r)) }));
  } catch (e) {
    toast((e as Error).message);
    composerStore.set((c) => ({ ...c, refs: c.refs.filter((r) => !(r.kind === 'upload' && r.key === tmp)) }));
  } finally {
    // the server copy is shown from now on (or the reference is gone)
    setTimeout(() => URL.revokeObjectURL(local), 2000);
  }
}

// ── generating
const patchDraft = (key: string, p: Partial<Tile>) => draftsStore.set((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
const dropDraft = (key: string) => draftsStore.set((ds) => ds.filter((d) => d.key !== key));
const preload = (url: string) => new Promise<void>((res) => { const i = new Image(); i.decoding = 'async'; i.src = url; i.decode().then(() => res(), () => res()); });

async function finishOption(key: string, pieceId: string, version: Version, files: PieceFile[]) {
  const ai = meStore.get()?.ai;
  patchDraft(key, { id: pieceId, state: 'rendering' });
  let v = version;
  let res = await render(pieceId, v.source, files, PRIORITY.wall);
  if (!res.ok && ai === 'workers-ai') {
    const fixed = await api<{ version: Version }>(`/pieces/${pieceId}/repair`, { body: { versionId: v.id, diagnostics: res.diagnostics } });
    v = fixed.version;
    res = await render(pieceId, v.source, files, PRIORITY.wall);
  }
  if (!res.ok) throw new Error(res.diagnostics.find((d) => d.level === 'error')?.msg || 'this option did not compile');
  const r = res.r;
  patchDraft(key, { src: r.sm, w: r.w, h: r.h, category: r.compiled.category, title: r.compiled.name });
  const card = await commit(pieceId, v, r);
  // swap to the stored poster once it is in the browser's cache, so nothing flickers
  if (card.sm) await preload(card.sm);
  draftsStore.set((ds) => ds.filter((d) => d.key !== key));
  wallStore.set((w) => ({ ...w, mine: [fromCard(card), ...w.mine.filter((m) => m.id !== card.id)] }));
  if (r.compiled.video) {
    encodePreview(pieceId, v, files).then((url) => {
      if (url) wallStore.set((w) => ({ ...w, mine: w.mine.map((m) => (m.id === pieceId ? { ...m, video: url } : m)) }));
    }).catch(() => { /* the poster stands in until the next visit */ });
  }
}

export async function generate() {
  const c = composerStore.get();
  const prompt = c.text.trim();
  if (!prompt || c.busy) return;
  if (c.refs.some((r) => r.kind === 'upload' && r.uploading)) { toast('Wait for the upload to finish'); return; }
  const n = 4, batch = Math.random().toString(36).slice(2, 8);
  const keys = Array.from({ length: n }, (_, i) => `draft-${batch}-${i}`);
  draftsStore.set((ds) => [...keys.map((key) => ({ key, id: null, title: prompt.slice(0, 40), category: null, mine: true, state: 'writing' as const, src: null, w: null, h: null, video: null })), ...ds]);
  composerStore.set((s) => ({ ...s, busy: true, open: false }));
  if (wallStore.get().view !== 'all' || wallStore.get().tab !== 'all') void loadWall({ tab: 'all', view: 'all' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const work: Promise<void>[] = [];
  const seen = new Set<number>();
  try {
    await streamLines('/generate', {
      prompt, n,
      refs: c.refs.filter((r) => r.kind === 'piece').map((r) => (r as { id: string }).id),
      uploads: c.refs.filter((r) => r.kind === 'upload').map((r) => (r as { key: string }).key),
    }, (line) => {
      if (line.type === 'piece') {
        seen.add(line.index);
        const key = keys[line.index];
        work.push(finishOption(key, line.piece.id, line.version, line.files).catch((e) => {
          patchDraft(key, { state: 'failed' });
          toast(e instanceof ApiError ? e.message : 'One option did not render: ' + (e as Error).message);
          setTimeout(() => dropDraft(key), 4000);
        }));
      } else if (line.type === 'error') {
        seen.add(line.index);
        patchDraft(keys[line.index], { state: 'failed' });
        setTimeout(() => dropDraft(keys[line.index]), 4000);
      }
    });
    composerStore.set((s) => ({ ...s, text: '' }));
  } catch (e) {
    toast((e as Error).message);
  } finally {
    keys.forEach((k, i) => { if (!seen.has(i)) dropDraft(k); });
    composerStore.set((s) => ({ ...s, busy: false }));
  }
  await Promise.allSettled(work);
}

// ── removing (drag out, or onto Remove)
export async function removeTile(t: Tile) {
  if (!t.id) return;
  if (t.mine) {
    const before = wallStore.get().mine;
    wallStore.set((w) => ({ ...w, mine: w.mine.filter((m) => m.id !== t.id) }));
    try {
      await api(`/pieces/${t.id}`, { method: 'DELETE' });
      toast(`Removed “${t.title}”`, { label: 'Undo', run: async () => { await api(`/pieces/${t.id}/restore`, { body: {} }); wallStore.set((w) => ({ ...w, mine: before })); } });
    } catch (e) { wallStore.set((w) => ({ ...w, mine: before })); toast((e as Error).message); }
    return;
  }
  const id = t.id;
  saveHidden(new Set([...hiddenStore.get(), id]));
  toast(`Hid “${t.title}”`, { label: 'Undo', run: () => { const s = new Set(hiddenStore.get()); s.delete(id); saveHidden(s); } });
}

// ── dragging a tile
export const dragStore = createStore<Tile | null>(null);
