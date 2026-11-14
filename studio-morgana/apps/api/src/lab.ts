// The lab: an admin-only page for trying models by hand (feature flag LAB=on): a plain chat with any model the service
// offers, with the studio's own tools in reach (the manual and the godtongue compiler) so tool use can be watched. It reaches the service with LAB_BASE_URL / LAB_API_KEY (falling back to AI_BASE_URL / AI_API_KEY), so
// trying a model never changes what the app itself uses.
import { Hono } from 'hono';
import type { App, Env, Who } from './env';
import { FACTS } from './guide.gen';
import { fail } from './util';
import { within } from './wizard/models';
import { contents, log } from './wizard/common';
import { MANUAL } from './manual.gen';
import { check } from './gt/checker.gen.js';

export const labOn = (env: Env, who: Who) => env.LAB === 'on' && who.role === 'admin';
const cfg = (env: Env) => ({ base: (env.LAB_BASE_URL || env.AI_BASE_URL || '').replace(/\/+$/, ''), key: env.LAB_API_KEY || env.AI_API_KEY || '' });

export const lab = new Hono<App>();
// not an admin, or the flag is off: the page does not exist
lab.use('*', async (c, next) => { if (!labOn(c.env, c.get('who'))) fail(404, 'not found'); await next(); });

lab.get('/config', (c) => {
  const { base, key } = cfg(c.env);
  return c.json({ service: base ? new URL(base).host : null, keySet: !!key, app: { provider: c.env.AI_PROVIDER || 'workers-ai', reader: c.env.READER_MODEL || c.env.AI_READER || null, writer: c.env.WRITER_MODEL || c.env.AI_MODEL || null } });
});

// what the service offers, with what it says about images and price when it says
lab.get('/models', async (c) => {
  const { base, key } = cfg(c.env);
  if (!base || !key) fail(409, 'set LAB_BASE_URL and LAB_API_KEY (wrangler secret put LAB_API_KEY) to list models');
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
      context: m.context_length ?? m.context_window ?? null,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return c.json({ models });
});

// what the model can call: the manual, and the compiler
const TOOLS = [
  { type: 'function', function: { name: 'list_manual', description: 'List the chapters of the godtongue manual (id and title).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'read_manual', description: 'Read chapters of the godtongue manual by id.', parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } } },
  { type: 'function', function: { name: 'compile_godtongue', description: 'Compile godtongue source and get back whether it compiles, with each error, its line and the compiler\'s suggestion.', parameters: { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] } } },
];
const BY_ID = new Map(MANUAL.map((c) => [c.id, c]));
function callTool(name: string, args: any): string {
  if (name === 'list_manual') return contents();
  if (name === 'read_manual') {
    const ids: string[] = (Array.isArray(args?.ids) ? args.ids : []).map(String).slice(0, 8);
    const out = ids.map((id) => BY_ID.get(id)?.text ?? `(no chapter called ${id})`).join('\n\n');
    return out.length > 14000 ? out.slice(0, 14000) + '\n…(cut)' : out;
  }
  if (name === 'compile_godtongue') {
    const r = check(String(args?.source ?? ''), {});
    return JSON.stringify({ compiles: r.ok, kind: r.kind, errors: r.diagnostics.filter((d) => d.level === 'error').slice(0, 10).map((d) => ({ line: d.line, error: d.msg, hint: d.hint, suggestion: d.fix?.replace })), things: Object.keys(r.elements ?? {}) });
  }
  return `no tool called ${name}`;
}
const SYSTEM = 'You are being tested inside Studio Morgana, a studio that makes designs by writing godtongue: plain English that compiles to a picture. You may answer anything. When asked to make or change a design, learn the words with list_manual and read_manual, write godtongue, and check it with compile_godtongue before you answer. Show the final source in a ```gt block.';

interface ChatBody { model?: string; messages?: { role: string; content: string }[]; image?: string }
export interface Step { tool: string; args: unknown; result: string; ms: number }

lab.post('/chat', async (c) => {
  const { base, key } = cfg(c.env);
  if (!base || !key) fail(409, 'set LAB_BASE_URL and LAB_API_KEY first');
  const b = (await c.req.json().catch(() => ({}))) as ChatBody;
  const model = String(b.model || '').slice(0, 200);
  if (!model) fail(400, 'choose a model');
  const turns = (Array.isArray(b.messages) ? b.messages : []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-30);
  if (!turns.length || turns[turns.length - 1].role !== 'user') fail(400, 'say something first');
  const image = typeof b.image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(b.image) && b.image.length < 6_000_000 ? b.image : null;
  const messages: any[] = [{ role: 'system', content: SYSTEM }, ...turns.map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }))];
  if (image) { const last = messages[messages.length - 1]; messages[messages.length - 1] = { role: 'user', content: [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: image } }] }; }

  const t0 = Date.now(), steps: Step[] = [];
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
        log('lab-chat', { model, ms: Date.now() - t0, status: r.status, ok: false });
        return c.json({ ok: false, status: r.status, ms: Date.now() - t0, steps, model, error: (r.j?.error?.message || r.j?.error || r.raw || 'no answer').toString().slice(0, 600) });
      }
      usage.prompt += r.j.usage?.prompt_tokens ?? 0; usage.completion += r.j.usage?.completion_tokens ?? 0;
      const msg = r.j.choices[0].message ?? {};
      const calls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (!calls.length) {
        const text = msg.content ?? r.j.choices[0].text ?? '';
        log('lab-chat', { model, ms: Date.now() - t0, ok: !!text, tools: steps.map((s) => s.tool), image: !!image });
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
    log('lab-chat', { model, ms: Date.now() - t0, ok: false, error: (e as Error).message });
    return c.json({ ok: false, status: 0, ms: Date.now() - t0, steps, model, error: (e as Error).message });
  }
});
