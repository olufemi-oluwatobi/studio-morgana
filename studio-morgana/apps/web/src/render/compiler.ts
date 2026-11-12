// The compile worker client: one worker for the whole app, created on first use.
export interface Part { n: number; name: string; face: string; kind?: string; ops: string[]; lines: number[]; materials?: string[]; mask?: string | null; pin?: [number, number] }
export interface Diagnostic { level: string; line?: number; msg: string; hint?: string }
export type Compiled =
  | { ok: true; html: string; name: string; kind: string; category: 'cards' | 'posts' | 'scenes' | 'videos'; video: { seconds: number; fps: number } | null;
      size: [number, number]; crop: [number, number, number, number] | null; corners: number; faces: string[]; parts: Part[]; ms: number; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

let worker: Worker | null = null;
let ready: Promise<unknown> | null = null;
let seq = 0;
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
const mounted = new Set<string>();

function call<T>(cmd: string, args: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker('/runtime/compiler.worker.js');
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.res(e.data.r); else p.rej(new Error(e.data.error));
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'the compiler stopped')); pending.clear(); };
  }
  const id = ++seq;
  return new Promise<T>((res, rej) => { pending.set(id, { res, rej }); worker!.postMessage({ id, cmd, ...args }, transfer); });
}

function init() {
  if (!ready) { ready = call('init', { base: '/runtime/' }); ready.catch(() => { ready = null; }); }
  return ready;
}
// start loading fonts and the compiler early, off the main thread
export const warmCompiler = () => { void init(); };

export async function compile(pieceDir: string, source: string, files: { name: string; url: string }[]): Promise<Compiled> {
  await init();
  const need = files.filter((f) => !mounted.has(pieceDir + '/' + f.name));
  if (need.length) {
    const bufs: Record<string, ArrayBuffer> = {};
    await Promise.all(need.map(async (f) => {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`could not load ${f.name}`);
      bufs[f.name] = await r.arrayBuffer();
    }));
    await call('mount', { dir: pieceDir, files: bufs }, Object.values(bufs));
    need.forEach((f) => mounted.add(pieceDir + '/' + f.name));
  }
  return call<Compiled>('compile', { source, dir: pieceDir });
}
