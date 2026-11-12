// The render frame: one sandboxed iframe that runs the engine page for one piece at a time.
// Jobs run one after another, most urgent first. A long video encode gives way to anything interactive: the frame is
// replaced (which stops the encode at once and frees its memory) and the encode is queued again.
import { BRIDGE } from './bridge.gen';

export const PRIORITY = { interactive: 0, wall: 1, video: 2 } as const;
type Pri = (typeof PRIORITY)[keyof typeof PRIORITY];

export class Aborted extends Error { constructor() { super('aborted'); this.name = 'Aborted'; } }

interface FrameInfo { video: { seconds: number; fps: number } | null; faces: string[][]; buildMs: number; W: number; H: number; unsupported: string[] }
export interface Session {
  info: FrameInfo;
  call<T>(cmd: string, args?: Record<string, unknown>, onProgress?: (k: number) => void): Promise<T>;
}

let frame: HTMLIFrameElement | null = null;
let seq = 0;
const waiting = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; progress?: (k: number) => void }>();
let onReady: { res: (i: FrameInfo) => void; rej: (e: Error) => void } | null = null;

function onMessage(e: MessageEvent) {
  if (!frame || e.source !== frame.contentWindow) return;
  const d = e.data || {};
  if (d.type === 'ready') { onReady?.res(d.info); onReady = null; return; }
  if (d.type === 'error') { onReady?.rej(new Error(d.error)); onReady = null; return; }
  if (d.type === 'progress') { waiting.get(d.id)?.progress?.(d.k); return; }
  const p = waiting.get(d.id);
  if (!p) return;
  waiting.delete(d.id);
  if (d.ok) p.res(d.r); else p.rej(new Error(d.error));
}

function makeFrame(): HTMLIFrameElement {
  if (frame) return frame;
  window.addEventListener('message', onMessage);
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.title = 'renderer';
  // on screen but invisible: hidden frames can be throttled
  f.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;border:0;pointer-events:none;z-index:-1';
  document.body.appendChild(f);
  frame = f;
  return f;
}

// drop the frame: stops whatever it is doing and releases its WebGL context and memory
function killFrame(reason: Error) {
  for (const p of waiting.values()) p.rej(reason);
  waiting.clear();
  onReady?.rej(reason); onReady = null;
  if (frame) { frame.remove(); frame = null; window.removeEventListener('message', onMessage); }
}

async function open(html: string): Promise<Session> {
  const f = makeFrame();
  const info = await new Promise<FrameInfo>((res, rej) => {
    onReady = { res, rej };
    f.srcdoc = html.replace('<body>', '<body><script>' + BRIDGE + '</script>');
  });
  return {
    info,
    call<T>(cmd: string, args: Record<string, unknown> = {}, progress?: (k: number) => void) {
      const id = ++seq;
      return new Promise<T>((res, rej) => {
        if (!frame?.contentWindow) return rej(new Aborted());
        waiting.set(id, { res, rej, progress });
        frame.contentWindow.postMessage({ id, cmd, args }, '*');
      });
    },
  };
}

// ── the queue
interface Job<T> { pri: Pri; run: (s: (html: string) => Promise<Session>) => Promise<T>; res: (v: T) => void; rej: (e: Error) => void; started?: boolean }
const queue: Job<any>[] = [];
let running: Job<any> | null = null;

function pump() {
  if (running || !queue.length) return;
  queue.sort((a, b) => a.pri - b.pri);
  const job = queue.shift()!;
  running = job;
  job.started = true;
  job.run(open).then(job.res, job.rej).finally(() => {
    running = null;
    // release the page between jobs; the next job loads its own
    if (frame?.contentWindow) frame.srcdoc = '';
    pump();
  });
}

export function schedule<T>(pri: Pri, run: Job<T>['run']): Promise<T> {
  return new Promise<T>((res, rej) => {
    const job: Job<T> = { pri, run, res, rej };
    queue.push(job);
    if (running && running.pri === PRIORITY.video && pri < PRIORITY.video) killFrame(new Aborted());
    pump();
  });
}

export function cancelQueued(pred: (pri: Pri) => boolean) {
  for (let i = queue.length - 1; i >= 0; i--) if (pred(queue[i].pri)) { queue[i].rej(new Aborted()); queue.splice(i, 1); }
}
