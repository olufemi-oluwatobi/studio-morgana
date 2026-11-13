// The compile worker client: one worker for the whole app, created on first use.
export interface Part { n: number; name: string; face: string; kind?: string; ops: string[]; lines: number[]; materials?: string[]; mask?: string | null; pin?: [number, number] }
export interface Diagnostic {
  level: string; line?: number; col?: number; msg: string; hint?: string;
  range?: { line: number; col: number; len: number };      // the word at fault (col is 1-based)
  fix?: { replace: string; label: string };                // "did you mean": a ready change
  follows?: number;                                        // the sentence on this line failed first and caused this one
  internal?: boolean;                                      // a fault in Morgana, not in the sentence
}
export interface Elem { name: string; line: number | null; box: [number, number, number, number]; kind: string; text?: string; font?: string; size?: number; fill?: string; looks: string[] }
export interface Checked { diagnostics: Diagnostic[]; elements: Record<string, Elem> | null; size?: [number, number]; crop?: [number, number, number, number] | null }
export interface RefWord { words: string[]; kind?: string; help?: string; example?: string; examples?: string[]; params?: Record<string, unknown>; type?: string; hex?: string }
export interface Reference { verbs: RefWord[]; words: RefWord[]; generators: RefWord[]; materials: RefWord[]; colors: { name: string; hex: string }[]; styles: RefWord[] }
export type Compiled =
  | { ok: true; html: string; name: string; kind: string; category: 'cards' | 'posts' | 'scenes' | 'videos'; video: { seconds: number; fps: number } | null;
      size: [number, number]; crop: [number, number, number, number] | null; corners: number; faces: string[]; parts: Part[]; ms: number; diagnostics: Diagnostic[]; elements?: Record<string, Elem> }
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

async function mountFiles(pieceDir: string, files: { name: string; url: string }[]) {
  const need = files.filter((f) => !mounted.has(pieceDir + '/' + f.name));
  if (!need.length) return;
  const bufs: Record<string, ArrayBuffer> = {};
  await Promise.all(need.map(async (f) => {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`could not load ${f.name}`);
    bufs[f.name] = await r.arrayBuffer();
  }));
  await call('mount', { dir: pieceDir, files: bufs }, Object.values(bufs));
  need.forEach((f) => mounted.add(pieceDir + '/' + f.name));
}

export async function compile(pieceDir: string, source: string, files: { name: string; url: string }[]): Promise<Compiled> {
  await init();
  await mountFiles(pieceDir, files);
  return call<Compiled>('compile', { source, dir: pieceDir });
}

// compile without drawing: what is wrong, and where each named thing is. Fast enough to run as the person types.
export async function check(pieceDir: string, source: string, files: { name: string; url: string }[]): Promise<Checked> {
  await init();
  await mountFiles(pieceDir, files);
  return call<Checked>('check', { source, dir: pieceDir });
}

let refP: Promise<Reference> | null = null;
export function reference(): Promise<Reference> {
  if (!refP) { refP = init().then(() => call<Reference>('reference')); refP.catch(() => { refP = null; }); }
  return refP;
}

// a card or canvas as a vector SVG (scenes and videos are not exported this way)
export async function compileSvg(pieceDir: string, source: string, files: { name: string; url: string }[]): Promise<Blob> {
  const c = await compile(pieceDir, source, files);   // mounts the piece's files
  if (!c.ok) throw new Error(c.diagnostics.find((d) => d.level === 'error')?.msg || 'does not compile');
  const r = await call<{ svg: string }>('svg', { source, dir: pieceDir });
  return new Blob([r.svg], { type: 'image/svg+xml' });
}
