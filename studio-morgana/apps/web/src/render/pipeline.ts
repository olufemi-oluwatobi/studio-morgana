// From a version's source to pictures: compile (worker) → render (frame) → posters, pins → upload → commit.
// Renders are remembered by fingerprint (source + files + engine version), so going back to a version is instant.
import { api, type PieceCard, type PieceFile, type Version } from '../lib/api';
import { compile, type Compiled, type Diagnostic, type Part } from './compiler';
import { Aborted, PRIORITY, schedule } from './host';
import { ENGINE_VERSION } from './engine-version.gen';
import { typeOfCompiled } from '../lib/types';

export type Ok = Extract<Compiled, { ok: true }>;
export interface Pin { n: number; name: string; face: string; x: number; y: number }
export interface Rendered {
  fingerprint: string; compiled: Ok; sm: string; lg: string; smBlob: Blob; lgBlob: Blob; w: number; h: number; pins: Pin[];
}
export type RenderResult = { ok: true; r: Rendered } | { ok: false; diagnostics: Diagnostic[] };

export async function fingerprint(source: string, files: { name: string; url: string }[]): Promise<string> {
  const text = ENGINE_VERSION + '\n' + files.map((f) => f.name + '=' + f.url).sort().join('\n') + '\n' + source;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}

// recent renders, newest last; object URLs are revoked when they fall out
const cache = new Map<string, Rendered>();
const MAX = 40;
function remember(r: Rendered) {
  cache.delete(r.fingerprint);
  cache.set(r.fingerprint, r);
  while (cache.size > MAX) {
    const [k, old] = cache.entries().next().value as [string, Rendered];
    cache.delete(k);
    URL.revokeObjectURL(old.sm); URL.revokeObjectURL(old.lg);
  }
}

const shownFace = (c: Ok) => (c.faces.includes('front') ? 'front' : null);
// a video's poster: late in the timeline, when the piece is (nearly) finished
const posterTime = (c: Ok) => (c.video ? c.video.seconds * 0.85 : 0);

function pinsOf(c: Ok, anchors: ([number, number] | null)[] | null): Pin[] {
  const face = shownFace(c);
  if (!c.crop) return c.parts.filter((p) => p.pin).map((p) => ({ n: p.n, name: p.name, face: p.face, x: p.pin![0], y: p.pin![1] }));
  const [cx, cy, cw, ch] = c.crop;
  const onFace = c.parts.filter((p) => !face || p.face === face);
  const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
  return onFace.flatMap((p: Part, i) => {
    if (p.name === 'card') return [{ n: p.n, name: p.name, face: p.face, x: 0.06, y: 0.045 }];
    const a = anchors?.[i];
    return a ? [{ n: p.n, name: p.name, face: p.face, x: clamp((a[0] - cx) / cw), y: clamp((a[1] - cy) / ch) }] : [];
  });
}

export async function render(pieceId: string, source: string, files: { name: string; url: string }[], pri: number = PRIORITY.wall): Promise<RenderResult> {
  const c = await compile('/p/' + pieceId, source, files);
  if (!c.ok) return { ok: false, diagnostics: c.diagnostics };
  const fp = await fingerprint(source, files);
  const hit = cache.get(fp);
  if (hit) { remember(hit); return { ok: true, r: { ...hit, compiled: c } }; }
  const face = shownFace(c);
  const out = await schedule(pri as 0 | 1 | 2, async (open) => {
    const s = await open(c.html);
    try {
      const t = posterTime(c);
      const posters = await s.call<{ width: number; height: number; blob: Blob }[]>('poster', { face, t, bare: !!c.crop, crop: c.crop, widths: [480, 1200] });
      const anchors = c.crop
        ? await s.call<([number, number] | null)[]>('anchors', { masks: c.parts.filter((p) => !face || p.face === face).map((p) => ({ svg: p.mask })), W: c.size[0], H: c.size[1] })
        : null;
      return { posters, anchors };
    } finally {
      s.call('dispose').catch(() => { /* the frame is already gone */ });
    }
  });
  const [small, large] = out.posters;
  const r: Rendered = {
    fingerprint: fp, compiled: c, smBlob: small.blob, lgBlob: large.blob, sm: URL.createObjectURL(small.blob), lg: URL.createObjectURL(large.blob),
    w: large.width, h: large.height, pins: pinsOf(c, out.anchors),
  };
  remember(r);
  return { ok: true, r };
}

export async function commit(pieceId: string, version: Version, r: Rendered): Promise<PieceCard> {
  const put = (name: string, blob: Blob, w: number, h: number) =>
    api(`/versions/${version.id}/outputs/${name}`, { method: 'PUT', raw: blob, headers: { 'content-type': blob.type || 'image/webp', 'x-width': String(w), 'x-height': String(h) } });
  await Promise.all([
    put('poster-480', r.smBlob, Math.round(r.w * Math.min(1, 480 / r.w)), Math.round(r.h * Math.min(1, 480 / r.w))),
    put('poster-1200', r.lgBlob, r.w, r.h),
  ]);
  const res = await api<{ piece: PieceCard }>(`/pieces/${pieceId}/commit`, {
    body: { versionId: version.id, category: r.compiled.category, type: typeOfCompiled(r.compiled), fingerprint: r.fingerprint, w: r.w, h: r.h },
  });
  return res.piece;
}

// the video for the wall's previews and the player: encoded in the background, smaller than an export
export async function encodePreview(pieceId: string, version: Version, files: PieceFile[], onProgress?: (k: number) => void): Promise<string | null> {
  const c = await compile('/p/' + pieceId, version.source, files);
  if (!c.ok || !c.video) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const v = await schedule(PRIORITY.video, async (open) => {
        const s = await open(c.html);
        try { return await s.call<{ blob: Blob }>('encode', { fps: 24, width: 540, bitrate: 2.5e6 }, onProgress); }
        finally { s.call('dispose').catch(() => { /* gone */ }); }
      });
      const up = await api<{ url: string }>(`/versions/${version.id}/outputs/video`, { method: 'PUT', raw: v.blob, headers: { 'content-type': v.blob.type || 'video/mp4' } });
      return up.url;
    } catch (e) {
      if (e instanceof Aborted) continue; // something interactive came first; try again when the frame is free
      throw e;
    }
  }
  return null;
}

// exports, at full size, on request
export async function exportImage(pieceId: string, source: string, files: PieceFile[]): Promise<Blob> {
  const c = await compile('/p/' + pieceId, source, files);
  if (!c.ok) throw new Error(c.diagnostics.find((d) => d.level === 'error')?.msg || 'does not compile');
  return schedule(PRIORITY.interactive, async (open) => {
    const s = await open(c.html);
    try {
      const [p] = await s.call<{ blob: Blob }[]>('poster', { face: shownFace(c), t: posterTime(c), bare: !!c.crop, crop: c.crop, widths: [4000], type: 'image/png' });
      return p.blob;
    } finally { s.call('dispose').catch(() => { /* gone */ }); }
  });
}
export async function exportVideo(pieceId: string, source: string, files: PieceFile[], onProgress: (k: number) => void): Promise<Blob> {
  const c = await compile('/p/' + pieceId, source, files);
  if (!c.ok) throw new Error(c.diagnostics.find((d) => d.level === 'error')?.msg || 'does not compile');
  if (!c.video) throw new Error('this piece has no timeline');
  return schedule(PRIORITY.wall, async (open) => {
    const s = await open(c.html);
    try { return (await s.call<{ blob: Blob }>('encode', { fps: 30, width: 1080, bitrate: 8e6 }, onProgress)).blob; }
    finally { s.call('dispose').catch(() => { /* gone */ }); }
  });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
