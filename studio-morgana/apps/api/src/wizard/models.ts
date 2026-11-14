// The two models. A reader that can see (Llama 4 Scout on Workers AI) looks at images, breaks a brief down, picks the
// chapters of the manual and reviews renders. A writer (GPT-OSS on Workers AI) writes and fixes godtongue.
// Both sit behind one small interface, so tests can script them and the wizards never touch Workers AI directly.
import type { Env } from '../env';

export interface Img { name?: string; mime: string; bytes: Uint8Array }
export interface Ask { system?: string; prompt: string; images?: Img[]; maxTokens?: number; temperature?: number }
export interface Models {
  read(a: Ask): Promise<string>;            // sees images; short, structured answers
  write(a: Ask): Promise<string>;           // writes code; no images
  names: { reader: string; writer: string };
}

export const SCOUT = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const OSS = '@cf/openai/gpt-oss-120b';
const MAX_IMAGE = 3_500_000;                 // bigger images are described from their name only

// the shape of the reply differs between model families; take the text from whichever field carries it
export function textOf(r: unknown): string {
  const x = r as any;
  if (typeof x === 'string') return x;
  if (typeof x?.response === 'string') return x.response;
  if (x?.response && typeof x.response === 'object') return JSON.stringify(x.response);
  const ch = x?.choices?.[0];
  if (typeof ch?.message?.content === 'string' && ch.message.content) return ch.message.content;
  if (typeof ch?.text === 'string') return ch.text;
  if (typeof x?.output_text === 'string') return x.output_text;
  if (Array.isArray(x?.output)) for (const o of x.output) if (o?.type === 'message') for (const c of o.content || []) if (typeof c?.text === 'string' && c.text) return c.text;
  throw new Error('the model returned no text');
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ── providers ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Each role (reader, writer) is served by one provider, configured on its own:
//   READER_PROVIDER / READER_BASE_URL / READER_API_KEY / READER_MODEL     (and WRITER_…)
// and anything not set there falls back to the shared AI_PROVIDER / AI_BASE_URL / AI_API_KEY (and AI_READER / AI_MODEL
// for the model names), so one setting can serve both. A provider turns a role's settings into `ask → text`. To add a
// service, register a factory below; most services speak the OpenAI chat format and need only a base URL and a key.
export type Role = 'read' | 'write';
export interface RoleConfig { role: Role; provider: string; baseUrl: string; apiKey: string; model: string }
export type Backend = (a: Ask) => Promise<string>;
export type ProviderFactory = (c: RoleConfig, env: Env, fetcher: typeof fetch) => Backend;

export function roleConfig(env: Env, role: Role): RoleConfig {
  const e = env as unknown as Record<string, string | undefined>, pre = role === 'read' ? 'READER_' : 'WRITER_';
  const provider = (e[pre + 'PROVIDER'] || env.AI_PROVIDER || 'workers-ai').toLowerCase();
  const fallback = provider === 'workers-ai' ? (role === 'read' ? SCOUT : OSS) : '';
  return {
    role, provider,
    baseUrl: (e[pre + 'BASE_URL'] || env.AI_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: e[pre + 'API_KEY'] || env.AI_API_KEY || '',
    model: e[pre + 'MODEL'] || (role === 'read' ? env.AI_READER || env.AI_MODEL : env.AI_MODEL) || fallback,
  };
}
// is this role ready to be called?
export function roleReady(env: Env, role: Role): boolean {
  const c = roleConfig(env, role);
  return c.provider === 'workers-ai' ? !!env.AI : !!(c.baseUrl && c.apiKey);
}

const imagesOf = (a: Ask) => (a.images || []).filter((i) => i.bytes.length <= MAX_IMAGE && /^image\/(png|jpe?g|webp|gif)$/.test(i.mime));
const dataUrl = (i: Img) => `data:${i.mime};base64,${b64(i.bytes)}`;
const noteTooBig = (a: Ask, shown: Img[]) => (a.images || []).length > shown.length ? `\n\n(Some images were too large to show: ${(a.images || []).filter((i) => !shown.includes(i)).map((i) => i.name).join(', ')}.)` : '';

// any service that speaks the OpenAI chat format: OpenAI, OpenRouter, Together, Groq, a vLLM of your own …
export const openAiBackend: ProviderFactory = (c, _env, fetcher) => async (a) => {
  const reading = c.role === 'read', ms = reading ? READ_MS : WRITE_MS;
  const shown = reading ? imagesOf(a) : [];
  const text = a.prompt + (reading ? noteTooBig(a, shown) : '');
  const content = shown.length ? [{ type: 'text', text }, ...shown.map((i) => ({ type: 'image_url', image_url: { url: dataUrl(i) } }))] : text;
  const messages = [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content }];
  const bodyFor = (model: string) => JSON.stringify({ model, messages, max_tokens: a.maxTokens ?? (reading ? 1500 : 6000), temperature: a.temperature ?? (reading ? 0.2 : 0.6) });
  let body = bodyFor(c.model), matched = false, last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctl = new AbortController();
      const r = await within(fetcher(c.baseUrl + '/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` }, body }), ms, 'the generator').catch((e) => { ctl.abort(); throw e; });
      // the service may name the model with a prefix ("deepseek/deepseek-flash"): look it up once and retry with its own id
      if ((r.status === 400 || r.status === 404) && !matched) {
        matched = true;
        const list = await fetcher(c.baseUrl + '/models', { headers: { authorization: `Bearer ${c.apiKey}` } }).then((x) => x.json()).catch(() => null) as any;
        const id = (list?.data ?? []).map((m: any) => String(m.id)).find((x: string) => x.toLowerCase().split('/').pop() === c.model.toLowerCase());
        if (id && id !== c.model) { body = bodyFor(id); attempt--; continue; }
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return textOf(await within(r.json(), ms, 'the generator'));
    } catch (e) { last = e; if (timedOut(e)) break; await new Promise((res) => setTimeout(res, 400 + attempt * 800)); }
  }
  throw new ModelError('the generator is not answering right now', last);
};

export class ModelError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); } }

// a model that never answers must not hold a piece forever: every call has a deadline
export const READ_MS = 45_000, WRITE_MS = 90_000;
export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ModelError(`${what} took too long`, 'timeout')), ms); })]).finally(() => clearTimeout(t));
}
const timedOut = (e: unknown) => e instanceof ModelError && e.cause === 'timeout';

// Cloudflare Workers AI (the AI binding)
export const workersAiBackend: ProviderFactory = (c, env) => {
  const ai = env.AI as any, reading = c.role === 'read', ms = reading ? READ_MS : WRITE_MS;
  const run = async (input: Record<string, unknown>) => {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return textOf(await within(ai.run(c.model, input), ms, c.model.split('/').pop()!)); }
      catch (e) { last = e; if (timedOut(e)) break; await new Promise((r) => setTimeout(r, 400 + attempt * 800)); }
    }
    throw new ModelError(`${c.model.split('/').pop()} is not answering right now`, last);
  };
  return async (a) => {
    const max = a.maxTokens ?? (reading ? 1500 : 6000), temperature = a.temperature ?? (reading ? 0.2 : 0.6);
    if (!reading) {
      const messages = [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content: a.prompt }];
      try { return await run({ messages, max_tokens: max, temperature, reasoning: { effort: 'low' } }); }
      catch (e) { if (timedOut(e)) throw e; return run({ messages, max_tokens: max, temperature }); }
    }
    const imgs = imagesOf(a), text = a.prompt + noteTooBig(a, imgs);
    const content = imgs.length ? [{ type: 'text', text }, ...imgs.map((i) => ({ type: 'image_url', image_url: { url: dataUrl(i) } }))] : text;
    const messages = [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content }];
    try { return await run({ messages, max_tokens: max, temperature }); }
    catch (e) {
      if (!imgs.length) throw e;
      // a reader that will not take images still reads the brief
      return run({ messages: [...messages.slice(0, -1), { role: 'user', content: text + '\n\n(The images could not be shown to you; work from their names.)' }], max_tokens: max, temperature });
    }
  };
};

// the registry: provider name → factory. Add a service here (or call registerProvider) and select it with *_PROVIDER.
const PROVIDERS: Record<string, ProviderFactory> = { 'workers-ai': workersAiBackend, openai: openAiBackend };
export const registerProvider = (name: string, f: ProviderFactory) => { PROVIDERS[name.toLowerCase()] = f; };

export function buildModels(env: Env, fetcher: typeof fetch = fetch): Models {
  const make = (role: Role): { backend: Backend; cfg: RoleConfig } => {
    const cfg = roleConfig(env, role), f = PROVIDERS[cfg.provider];
    if (!f) throw new ModelError(`the AI provider "${cfg.provider}" is not set up (known: ${Object.keys(PROVIDERS).join(', ')})`);
    if (!cfg.model) throw new ModelError(`no model is chosen for the ${role === 'read' ? 'reader' : 'writer'}: set ${role === 'read' ? 'READER_MODEL' : 'WRITER_MODEL'} (pick one on /chat)`);
    return { backend: f(cfg, env, fetcher), cfg };
  };
  const r = make('read'), w = make('write');
  return { read: r.backend, write: w.backend, names: { reader: `${r.cfg.provider}:${r.cfg.model}`, writer: `${w.cfg.provider}:${w.cfg.model}` } };
}
// kept for callers that name a provider outright
export const workersAi = (env: Env) => buildModels({ ...env, AI_PROVIDER: 'workers-ai', READER_PROVIDER: undefined, WRITER_PROVIDER: undefined } as Env);
export const openAiCompatible = (env: Env, fetcher: typeof fetch = fetch) => buildModels({ ...env, AI_PROVIDER: 'openai', READER_PROVIDER: undefined, WRITER_PROVIDER: undefined } as Env, fetcher);

// AI_MODE=scripted: the real wizards (plan, manual, write, compile, fix, patch, review) with stand-in models, so the
// whole path can run in `wrangler dev` without Workers AI. The writer's first piece carries one mistake on purpose
// ("grainey"), so the compile-and-fix loop runs every time.
export function scriptedModels(gen: (prompt: string, i: number, parts?: { n: number; name: string; face?: string; lines: number[] }[]) => string): Models {
  const quoted = (p: string, re: RegExp) => (p.match(re) || [])[1] || '';
  return {
    names: { reader: 'scripted-reader', writer: 'scripted-writer' },
    async read(a) {
      if (/designer was given these images/.test(a.prompt)) return 'The images: strong light, deep shadows, subject centred.';
      if (/plan a piece/i.test(a.prompt)) return JSON.stringify({ kind: 'canvas', title: 'piece', size: [1080, 1350], flat: true, mood: 'bold', palette: [], fonts: [], elements: [], images: [], notes: '' });
      if (/Pick the chapters/.test(a.prompt)) return '{"chapters":["verb:write","words"]}';
      if (/They asked/.test(a.prompt)) {
        const ask = quoted(a.prompt, /They asked: "([^"]*)"/);
        return JSON.stringify(/^(what|which|how|why)\b.*\?$/i.test(ask.trim()) ? { intent: 'question', targets: [], plan: '', answer: 'This is a scripted answer: the real reader answers from the picture and the source.' } : { intent: 'change', targets: [], plan: ask, chapters: [] });
      }
      if (/Does the image do what they asked/.test(a.prompt)) return '{"ok": true, "issues": [], "summary": "looks as asked"}';
      return '{}';
    },
    async write(a) {
      const brief = quoted(a.prompt, /Brief: "([^"]*)"/), opt = Number(quoted(a.prompt, /option (\d+) of/)) || 1;
      if (/does not compile/.test(a.prompt)) {
        const src = (a.prompt.match(/```\n([\s\S]*?)```/) || [, ''])[1]!.split('\n').map((l) => l.replace(/^\s*\d+\| ?/, '')).join('\n');
        return '```gt\n' + src.replace(/grainey/g, 'grainy') + '\n```';
      }
      if (/Reply with a patch/.test(a.prompt)) {
        const ask = quoted(a.prompt, /The person asked: "([^"]*)"/);
        const src = (a.prompt.match(/```\n([\s\S]*?)```/) || [, ''])[1]!.split('\n').map((l) => l.replace(/^\s*\d+\| ?/, '')).join('\n');
        const parts = [...a.prompt.matchAll(/P(\d+) = "([^"]+)"(?: \(([^)]+)\))?, lines ([\d, ]+)/g)].map((m) => ({ n: +m[1], name: m[2], face: m[3], lines: m[4].split(',').map(Number) }));
        return '```gt\n' + gen('edit:' + ask + '\n' + src, 0, parts) + '\n```';
      }
      const src = gen(brief, opt - 1).trimEnd();
      return '```gt\n' + src + '\nMake the card grainey, 0.04.\n```';
    },
  };
}
