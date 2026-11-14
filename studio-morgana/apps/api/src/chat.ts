// A plain chat with the app's own model service (the same AI_* settings and key the app uses), with a few harmless
// tools so tool calls can be watched. Each message counts against the visitor's daily edits, like any other.
import { Hono } from 'hono';
import type { App, Env } from './env';
import { fail } from './util';
import { OSS, SCOUT, roleConfig, within } from './wizard/models';
import { spend } from './auth';
import { log } from './wizard/common';


export const chat = new Hono<App>();

// the service the app itself uses: AI_PROVIDER, AI_BASE_URL, AI_API_KEY
const svc = (env: Env) => { const c = roleConfig(env, 'write'); return { workers: c.provider === 'workers-ai', base: c.baseUrl, key: c.apiKey }; };

// what the service offers, with what it says about images and price when it says
chat.get('/models', async (c) => {
  const { workers, base, key } = svc(c.env);
  if (workers) return c.json({ models: [{ id: OSS, vision: false, free: null }, { id: SCOUT, vision: true, free: null }] });
  if (!base || !key) fail(409, 'the AI service is not set up: set AI_BASE_URL and the AI_API_KEY secret');
  const r = await within(fetch(base + '/models', { headers: { authorization: `Bearer ${key}` } }), 20_000, 'the model list').catch((e) => { fail(502, (e as Error).message); });
  if (!r!.ok) fail(502, `the service answered ${r!.status} to the model list`);
  const j = (await r!.json().catch(() => ({}))) as any;
  const rows: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
  const text = (x: unknown) => JSON.stringify(x ?? '').toLowerCase();
  const models = rows.slice(0, 600).map((m) => {
    const mod = text(m.architecture?.input_modalities ?? m.input_modalities ?? m.modalities ?? m.capabilities ?? m.architecture?.modality);
    const price = m.pricing?.prompt ?? m.pricing?.input;
    return {
      id: String(m.id), vision: mod && mod !== '""' ? /image|vision|multimodal/.test(mod) : null,
      free: price !== undefined ? Number(price) === 0 : /:free\b|\bfree\b/.test(String(m.id).toLowerCase()) ? true : null,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return c.json({ models });
});

// what the model can call: small, harmless tools, only to see tool calls work
const TOOLS = [
  { type: 'function', function: { name: 'get_current_time', description: 'Get the current date and time (UTC).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'calculator', description: 'Evaluate an arithmetic expression such as "(12 + 8) * 3 / 4".', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } },
  { type: 'function', function: { name: 'random_number', description: 'Pick a random whole number between min and max (inclusive).', parameters: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } }, required: ['min', 'max'] } } },
];
// a small arithmetic parser (Workers do not allow eval): + - * / % ( ) and unary minus
function calc(src: string): number {
  const t = src.replace(/\s+/g, ''); let i = 0;
  const num = (): number => { const m = /^\d*\.?\d+/.exec(t.slice(i)); if (!m) throw new Error('number'); i += m[0].length; return Number(m[0]); };
  const atom = (): number => { if (t[i] === '(') { i++; const v = sum(); if (t[i++] !== ')') throw new Error(')'); return v; } if (t[i] === '-') { i++; return -atom(); } if (t[i] === '+') { i++; return atom(); } return num(); };
  const prod = (): number => { let v = atom(); while (t[i] === '*' || t[i] === '/' || t[i] === '%') { const o = t[i++], r = atom(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
  const sum = (): number => { let v = prod(); while (t[i] === '+' || t[i] === '-') { const o = t[i++], r = prod(); v = o === '+' ? v + r : v - r; } return v; };
  const v = sum(); if (i !== t.length) throw new Error('end'); return v;
}
function callTool(name: string, args: any): string {
  if (name === 'get_current_time') return new Date().toISOString();
  if (name === 'calculator') {
    const e = String(args?.expression ?? '');
    if (!/^[\d\s+\-*/().%]+$/.test(e) || e.length > 200) return 'error: only numbers and + - * / % ( ) are allowed';
    try { const v = calc(e); return Number.isFinite(v) ? String(v) : 'error: not a finite number'; } catch { return 'error: could not evaluate that'; }
  }
  if (name === 'random_number') {
    const lo = Math.ceil(Number(args?.min)), hi = Math.floor(Number(args?.max));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return 'error: give a min and a max, min first';
    return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
  }
  return `no tool called ${name}`;
}
const SYSTEM = 'You are a helpful assistant. You may use the tools you are given when they help.';

interface ChatBody { model?: string; messages?: { role: string; content: string }[]; image?: string }
export interface Step { tool: string; args: unknown; result: string; ms: number }

chat.post('/', async (c) => {
  const { workers, base, key } = svc(c.env);
  if (!workers && (!base || !key)) fail(409, 'the AI service is not set up: set AI_BASE_URL and the AI_API_KEY secret');
  await spend(c.env, c.get('who'), 'command', 1);
  const b = (await c.req.json().catch(() => ({}))) as ChatBody;
  const model = String(b.model || '').slice(0, 200);
  if (!model) fail(400, 'choose a model');
  const turns = (Array.isArray(b.messages) ? b.messages : []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-30);
  if (!turns.length || turns[turns.length - 1].role !== 'user') fail(400, 'say something first');
  const image = typeof b.image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(b.image) && b.image.length < 6_000_000 ? b.image : null;
  const messages: any[] = [{ role: 'system', content: SYSTEM }, ...turns.map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }))];
  if (image) { const last = messages[messages.length - 1]; messages[messages.length - 1] = { role: 'user', content: [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: image } }] }; }

  const t0 = Date.now(), steps: Step[] = [];
  if (workers) {
    // Workers AI: plain chat (no tools, no images)
    try {
      const out: any = await within((c.env.AI as any).run(model, { messages: messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content[0]?.text ?? '' })), max_tokens: 2000 }), 90_000, model);
      const text = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
      log('chat', { model, ms: Date.now() - t0, ok: !!text });
      return c.json({ ok: !!text, text, steps, ms: Date.now() - t0, model, noTools: true, error: text ? undefined : 'the model sent an empty answer' });
    } catch (e) { return c.json({ ok: false, status: 0, ms: Date.now() - t0, steps, model, error: (e as Error).message }); }
  }
  let useTools = true, noTools = false, usage = { prompt: 0, completion: 0 };
  const post = async (): Promise<{ status: number; j: any; raw: string }> => {
    const ctl = new AbortController();
    const r = await within(fetch(base + '/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages, max_tokens: 4000, temperature: 0.6, ...(useTools ? { tools: TOOLS } : {}) }) }), 90_000, model).catch((e) => { ctl.abort(); throw e; });
    const raw = await within(r.text(), 90_000, model);
    let j: any = null; try { j = JSON.parse(raw); } catch { /* not JSON */ }
    return { status: r.status, j, raw };
  };
  try {
    for (let round = 0; round < 8; round++) {
      let r = await post();
      // a model that does not take tools still chats
      if (r.status >= 400 && useTools && round === 0 && /tool|function/i.test(r.raw)) { useTools = false; noTools = true; r = await post(); }
      if (r.status >= 400 || !r.j?.choices?.[0]) {
        log('chat', { model, ms: Date.now() - t0, status: r.status, ok: false });
        return c.json({ ok: false, status: r.status, ms: Date.now() - t0, steps, model, error: (r.j?.error?.message || r.j?.error || r.raw || 'no answer').toString().slice(0, 600) });
      }
      usage.prompt += r.j.usage?.prompt_tokens ?? 0; usage.completion += r.j.usage?.completion_tokens ?? 0;
      const msg = r.j.choices[0].message ?? {};
      const calls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (!calls.length) {
        const text = msg.content ?? r.j.choices[0].text ?? '';
        log('chat', { model, ms: Date.now() - t0, ok: !!text, tools: steps.map((s) => s.tool), image: !!image });
        return c.json({ ok: !!text, text, steps, ms: Date.now() - t0, usage, model, noTools, error: text ? undefined : 'the model sent an empty answer' });
      }
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const t1 = Date.now();
        let args: any = {}; try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* the model sent broken arguments */ }
        const result = callTool(String(call.function?.name), args);
        steps.push({ tool: String(call.function?.name), args, result: result.slice(0, 6000), ms: Date.now() - t1 });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return c.json({ ok: false, status: 0, ms: Date.now() - t0, steps, model, error: 'the model kept calling tools and never answered' });
  } catch (e) {
    log('chat', { model, ms: Date.now() - t0, ok: false, error: (e as Error).message });
    return c.json({ ok: false, status: 0, ms: Date.now() - t0, steps, model, error: (e as Error).message });
  }
});
