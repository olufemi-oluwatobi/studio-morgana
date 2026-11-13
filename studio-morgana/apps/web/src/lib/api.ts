// Talking to the Worker. Every write carries x-morgana: 1 (the Worker refuses writes without it).

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Opts = { method?: string; body?: unknown; signal?: AbortSignal; raw?: Blob | ArrayBuffer; headers?: Record<string, string> };

export async function api<T>(path: string, o: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-morgana': '1', ...o.headers };
  let body: BodyInit | undefined;
  if (o.raw) body = o.raw;
  else if (o.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.body); }
  const res = await fetch('/api' + path, { method: o.method || (body ? 'POST' : 'GET'), headers, body, signal: o.signal, credentials: 'same-origin' });
  if (!res.ok) {
    let msg = res.statusText || 'request failed';
    try { msg = (await res.json() as { error?: string }).error || msg; } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

// newline-delimited JSON, one object per line, handed over as each line arrives
export async function streamLines(path: string, body: unknown, onLine: (o: any) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api' + path, {
    method: 'POST', headers: { 'x-morgana': '1', 'content-type': 'application/json' }, body: JSON.stringify(body), signal, credentials: 'same-origin',
  });
  if (!res.ok || !res.body) {
    let msg = res.statusText || 'request failed';
    try { msg = (await res.json() as { error?: string }).error || msg; } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) onLine(JSON.parse(line));
      }
    }
    if (buf.trim()) onLine(JSON.parse(buf));
  } finally {
    reader.releaseLock();
  }
}

// ── shapes shared with the Worker
import type { PieceType } from './types';
export interface PieceCard {
  id: string; title: string; category: Category; type: PieceType; status: 'draft' | 'ready' | 'failed'; visibility: Visibility; mine: boolean;
  w: number | null; h: number | null; sm: string | null; lg: string | null; video: string | null; updated: number;
}
export type Visibility = 'private' | 'public';
export type Category = 'cards' | 'posts' | 'scenes' | 'videos';
export interface Version { id: string; n: number; source: string; by: string; command: string | null; parentId: string | null; fingerprint: string | null; created: number }
export interface PieceFile { name: string; url: string; type: string; bytes: number }
export interface PieceDetail {
  piece: PieceCard & { prompt: string | null; parentId: string | null; versionId: string | null; pinnedIn: string[] };
  version: Version; versions: { id: string; n: number; by: string; command: string | null; created: number; fingerprint: string | null }[];
  files: PieceFile[]; ai: 'workers-ai' | 'local';
}
export interface Project { id: string; name: string; updated: number; count: number; cover: string | null }
export interface Me { user: { id: string; email: string; role: 'user' | 'admin'; verified: number } | null; ai: 'workers-ai' | 'local'; email: boolean }
