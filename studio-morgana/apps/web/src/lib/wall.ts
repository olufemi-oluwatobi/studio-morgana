// The wall's state and actions: scope (all, yours, a project), type tabs, generating (skeletons → renders), references, removing.
import { api, ApiError, streamLines, type Category, type PieceCard, type PieceFile, type Version, type Visibility } from './api';
import { PIECE_TYPES, typeOfCompiled, type PieceType } from './types';
import { sameScope, type Scope } from './router';
import { bumpProject, pin } from './projects';
import { createStore } from './store';
import { meStore, toast } from './session';
import { commit, encodePreview, render } from '../render/pipeline';
import { PRIORITY } from '../render/host';

export type Tab = 'all' | PieceType;
export const TABS: { id: Tab; label: string; soon?: boolean }[] = [
  { id: 'all', label: 'All' }, ...PIECE_TYPES.map((t) => ({ id: t.id as Tab, label: t.label, soon: t.soon })),
];

export interface Tile {
  key: string; id: string | null; title: string; category: Category | null; type: PieceType | null; mine: boolean; visibility?: Visibility;
  state: 'writing' | 'rendering' | 'ready' | 'failed';
  src: string | null; w: number | null; h: number | null; video: string | null;
}
export const fromCard = (p: PieceCard): Tile => ({
  key: p.id, id: p.id, title: p.title, category: p.category, type: p.type, mine: p.mine, visibility: p.visibility, state: 'ready', src: p.sm, w: p.w, h: p.h, video: p.video,
});

// what the wall shows: everything (yours, then featured), only yours, or one project's pins.
// `pieces` is yours (all, mine) or the project's pins (project); `featured` is only filled on the main wall.
interface WallState {
  tab: Tab; scope: Scope; project: { id: string; name: string } | null;
  pieces: Tile[]; featured: Tile[]; next: number | null; loading: boolean; error: string | null;
}
export const wallStore = createStore<WallState>({ tab: 'all', scope: { kind: 'all' }, project: null, pieces: [], featured: [], next: 0, loading: false, error: null });
export type VisFilter = 'all' | Visibility;
export const visFilterStore = createStore<VisFilter>('all');
export const draftsStore = createStore<Tile[]>([]);

// a piece was saved (made, edited, remixed): put it first where it belongs
export function upsertPiece(card: PieceCard, opts: { pinned?: boolean } = {}) {
  wallStore.set((w) => {
    const has = w.pieces.some((m) => m.id === card.id);
    if (w.scope.kind === 'project' && !has && !opts.pinned) return w;
    return { ...w, pieces: [fromCard(card), ...w.pieces.filter((m) => m.id !== card.id)] };
  });
}
export function patchPiece(id: string, p: Partial<Tile>) {
  wallStore.set((w) => ({ ...w, pieces: w.pieces.map((m) => (m.id === id ? { ...m, ...p } : m)), featured: w.featured.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
}

// pieces this browser has put away (featured ones cannot be deleted, only hidden here)
const HIDDEN_KEY = 'morgana-hidden';
const readHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };
export const hiddenStore = createStore<ReadonlySet<string>>(new Set(typeof window === 'undefined' ? [] : readHidden()));
const saveHidden = (s: ReadonlySet<string>) => { hiddenStore.set(s); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* private window */ } };

let loadCtl: AbortController | null = null;
export async function loadWall(opts: { tab?: Tab; scope?: Scope; more?: boolean } = {}) {
  const s = wallStore.get();
  const tab = opts.tab ?? s.tab, scope = opts.scope ?? s.scope;
  const moved = !sameScope(scope, s.scope);
  if (opts.more && (s.loading || s.next == null)) return;
  loadCtl?.abort();
  const ctl = (loadCtl = new AbortController());
  const cursor = opts.more ? s.next ?? 0 : 0;
  wallStore.set((w) => ({
    ...w, tab, scope, loading: true, error: null, ...(opts.more ? {} : { next: 0 }),
    // a different wall: clear it now rather than show the old one under the new name
    ...(moved ? { pieces: [], featured: [], project: scope.kind === 'project' ? (w.project?.id === scope.id ? w.project : null) : null } : {}),
  }));
  try {
    const q = new URLSearchParams({ cursor: String(cursor), limit: '30' });
    if (tab !== 'all') q.set('type', tab);
    if (scope.kind === 'project') {
      const r = await api<{ project: { id: string; name: string }; pieces: PieceCard[]; next: number | null }>(`/projects/${scope.id}/wall?` + q, { signal: ctl.signal });
      wallStore.set((w) => ({
        ...w, loading: false, next: r.next, project: r.project, featured: [],
        pieces: opts.more ? [...w.pieces, ...r.pieces.map(fromCard)] : r.pieces.map(fromCard),
      }));
      return;
    }
    const r = await api<{ mine: PieceCard[]; featured: PieceCard[]; next: number | null }>('/wall?' + q, { signal: ctl.signal });
    wallStore.set((w) => ({
      ...w, loading: false, next: scope.kind === 'all' ? r.next : null, project: null,
      pieces: opts.more ? w.pieces : r.mine.map(fromCard),
      featured: scope.kind !== 'all' ? [] : opts.more ? [...w.featured, ...r.featured.map(fromCard)] : r.featured.map(fromCard),
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

async function finishOption(key: string, pieceId: string, version: Version, files: PieceFile[], projectId: string | null) {
  const ai = meStore.get()?.ai;
  patchDraft(key, { id: pieceId, state: 'rendering' });
  let v = version;
  let res = await render(pieceId, v.source, files, PRIORITY.wall);
  if (!res.ok && ai && ai !== 'local') {
    const fixed = await api<{ version: Version }>(`/pieces/${pieceId}/repair`, { body: { versionId: v.id, diagnostics: res.diagnostics } });
    v = fixed.version;
    res = await render(pieceId, v.source, files, PRIORITY.wall);
  }
  if (!res.ok) throw new Error(res.diagnostics.find((d) => d.level === 'error')?.msg || 'this option did not compile');
  const r = res.r;
  patchDraft(key, { src: r.sm, w: r.w, h: r.h, category: r.compiled.category, type: typeOfCompiled(r.compiled), title: r.compiled.name });
  const card = await commit(pieceId, v, r);
  // swap to the stored poster once it is in the browser's cache, so nothing flickers
  if (card.sm) await preload(card.sm);
  draftsStore.set((ds) => ds.filter((d) => d.key !== key));
  const s = wallStore.get().scope;
  upsertPiece(card, { pinned: s.kind === 'project' && s.id === projectId });
  if (projectId) bumpProject(projectId, 1, card.sm);
  if (r.compiled.video) {
    encodePreview(pieceId, v, files).then((url) => {
      if (url) patchPiece(pieceId, { video: url });
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
  draftsStore.set((ds) => [...keys.map((key) => ({ key, id: null, title: prompt.slice(0, 40), category: null, type: null, mine: true, state: 'writing' as const, src: null, w: null, h: null, video: null })), ...ds]);
  composerStore.set((s) => ({ ...s, busy: true, open: false }));
  // made on a project's wall: pinned there; on the main wall or yours: shown there
  const scope = wallStore.get().scope;
  const projectId = scope.kind === 'project' ? scope.id : null;
  if (wallStore.get().tab !== 'all') void loadWall({ tab: 'all' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const work: Promise<void>[] = [];
  const seen = new Set<number>();
  try {
    await streamLines('/generate', {
      prompt, n, projectId,
      refs: c.refs.filter((r) => r.kind === 'piece').map((r) => (r as { id: string }).id),
      uploads: c.refs.filter((r) => r.kind === 'upload').map((r) => (r as { key: string }).key),
    }, (line) => {
      if (line.type === 'plan' && line.plan?.title) {
        // the reader has planned the piece: the drafts take its name while the writer works
        keys.forEach((k) => patchDraft(k, { title: String(line.plan.title).replace(/-/g, ' ') }));
      } else if (line.type === 'piece') {
        seen.add(line.index);
        const key = keys[line.index];
        work.push(finishOption(key, line.piece.id, line.version, line.files, projectId).catch((e) => {
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

// ── removing (drag out, or onto Remove). On a project's wall that unpins; elsewhere it deletes your piece
// (with Undo) or hides someone else's.
export async function removeTile(t: Tile) {
  if (!t.id) return;
  const id = t.id;
  const scope = wallStore.get().scope;
  if (scope.kind === 'project') {
    const before = wallStore.get().pieces;
    wallStore.set((w) => ({ ...w, pieces: w.pieces.filter((m) => m.id !== id) }));
    try {
      await api(`/projects/${scope.id}/pins/${id}`, { method: 'DELETE' });
      bumpProject(scope.id, -1);
      toast(`Unpinned “${t.title}”`, { label: 'Undo', run: async () => { await pin(scope.id, t, { quiet: true }); wallStore.set((w) => (sameScope(w.scope, scope) ? { ...w, pieces: before } : w)); } });
    } catch (e) { wallStore.set((w) => ({ ...w, pieces: before })); toast((e as Error).message); }
    return;
  }
  if (t.mine) { await deletePiece(t); return; }
  saveHidden(new Set([...hiddenStore.get(), id]));
  toast(`Hid “${t.title}”`, { label: 'Undo', run: () => { const s = new Set(hiddenStore.get()); s.delete(id); saveHidden(s); } });
}

// delete one of your pieces (from the wall or the editor); Undo restores it
export async function deletePiece(t: { id: string | null; title: string }, after?: () => void) {
  if (!t.id) return;
  const id = t.id;
  const before = wallStore.get().pieces;
  wallStore.set((w) => ({ ...w, pieces: w.pieces.filter((m) => m.id !== id) }));
  try {
    await api(`/pieces/${id}`, { method: 'DELETE' });
    after?.();
    toast(`Deleted “${t.title}”`, { label: 'Undo', run: async () => { await api(`/pieces/${id}/restore`, { body: {} }); wallStore.set((w) => ({ ...w, pieces: before })); } });
  } catch (e) { wallStore.set((w) => ({ ...w, pieces: before })); toast((e as Error).message); }
}

// ── dragging a tile
export const dragStore = createStore<Tile | null>(null);

// ── seeding an empty wall (admins): make a few starter pieces here in the browser, then feature them.
// Featured pieces are public and sit first on everyone's wall; the showcase fills in behind them as people publish.
const STARTERS = [
  'a navy collectible card with chrome trim called "Aurora"',
  'sale poster for the weekend, red and gold',
  'minimal ivory piece called "Quiet"',
  'rose gold collectible for a jazz club',
];
export async function seedWall(onStep: (done: number, total: number) => void) {
  const before = new Set(wallStore.get().pieces.map((p) => p.id));
  for (let i = 0; i < STARTERS.length; i++) {
    onStep(i, STARTERS.length);
    composerStore.set((c) => ({ ...c, text: STARTERS[i], refs: [] }));
    await generate();
  }
  const ids = wallStore.get().pieces.filter((p) => p.mine && p.id && !before.has(p.id) && p.state === 'ready').map((p) => p.id as string);
  if (!ids.length) throw new Error('nothing was made, so there is nothing to feature');
  // keep what is already featured, put the new ones after
  const cur = await api<{ pieces?: { id: string }[]; pieceIds?: string[] }>('/admin/collections/featured').catch(() => ({} as { pieces?: { id: string }[]; pieceIds?: string[] }));
  const had = cur.pieceIds ?? cur.pieces?.map((p) => p.id) ?? [];
  await api('/admin/collections/featured', { method: 'PUT', body: { title: 'Featured', pieceIds: [...had, ...ids] } });
  onStep(STARTERS.length, STARTERS.length);
  await loadWall();
  return ids.length;
}
