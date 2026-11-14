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

export function openAiCompatible(env: Env, fetcher: typeof fetch = fetch): Models {
  const base = (env.AI_BASE_URL || '').replace(/\/+$/, ''), key = env.AI_API_KEY || '';
  const reader = env.AI_READER || 'gpt-4o-mini', writer = env.AI_MODEL || 'gpt-4o';
  const run = async (model: string, messages: unknown[], max: number, temperature: number): Promise<string> => {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetcher(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages, max_tokens: max, temperature }) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return textOf(await r.json());
      } catch (e) { last = e; await new Promise((res) => setTimeout(res, 400 + attempt * 800)); }
    }
    throw new ModelError('the generator is not answering right now', last);
  };
  return {
    names: { reader, writer },
    async read(a) {
      const imgs = (a.images || []).filter((i) => i.bytes.length <= MAX_IMAGE && /^image\/(png|jpe?g|webp|gif)$/.test(i.mime));
      const content = imgs.length ? [{ type: 'text', text: a.prompt }, ...imgs.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${b64(i.bytes)}` } }))] : a.prompt;
      return run(reader, [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content }], a.maxTokens ?? 1500, a.temperature ?? 0.2);
    },
    async write(a) {
      return run(writer, [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content: a.prompt }], a.maxTokens ?? 6000, a.temperature ?? 0.6);
    },
  };
}

export class ModelError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); } }

export function workersAi(env: Env): Models {
  const ai = env.AI as any;
  const reader = env.AI_READER || SCOUT, writer = env.AI_MODEL || OSS;
  const run = async (model: string, input: Record<string, unknown>) => {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return textOf(await ai.run(model, input)); }
      catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 + attempt * 800)); }
    }
    throw new ModelError(`${model.split('/').pop()} is not answering right now`, last);
  };
  return {
    names: { reader, writer },
    async read(a) {
      const imgs = (a.images || []).filter((i) => i.bytes.length <= MAX_IMAGE && /^image\/(png|jpe?g|webp|gif)$/.test(i.mime));
      const text = a.prompt + ((a.images || []).length > imgs.length ? `\n\n(Some images were too large to show: ${(a.images || []).filter((i) => !imgs.includes(i)).map((i) => i.name).join(', ')}.)` : '');
      const content = imgs.length
        ? [{ type: 'text', text }, ...imgs.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${b64(i.bytes)}` } }))]
        : text;
      const messages = [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content }];
      try { return await run(reader, { messages, max_tokens: a.maxTokens ?? 1500, temperature: a.temperature ?? 0.2 }); }
      catch (e) {
        if (!imgs.length) throw e;
        // a reader that will not take images still reads the brief
        return run(reader, { messages: [...messages.slice(0, -1), { role: 'user', content: text + '\n\n(The images could not be shown to you; work from their names.)' }], max_tokens: a.maxTokens ?? 1500, temperature: a.temperature ?? 0.2 });
      }
    },
    async write(a) {
      const messages = [...(a.system ? [{ role: 'system', content: a.system }] : []), { role: 'user', content: a.prompt }];
      try { return await run(writer, { messages, max_tokens: a.maxTokens ?? 6000, temperature: a.temperature ?? 0.6, reasoning: { effort: 'low' } }); }
      catch { return run(writer, { messages, max_tokens: a.maxTokens ?? 6000, temperature: a.temperature ?? 0.6 }); }
    },
  };
}

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
