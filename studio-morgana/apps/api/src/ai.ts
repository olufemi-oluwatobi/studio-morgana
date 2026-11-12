// The model side: GPT-OSS on Workers AI writes, edits and repairs godtongue.
// AI_MODE=local swaps in a small built-in generator (templates + colour/material edits) for offline work and tests.
import type { Env } from './env';
import { GUIDE } from './guide.gen';
import { localGenerate, localEdit } from './local-gen';
import { fail } from './util';

export interface PartBrief { n: number; name: string; face?: string; lines: number[] }
export interface Diagnostic { level: string; line?: number; msg: string; hint?: string }

const MODEL = (env: Env) => env.AI_MODEL || '@cf/openai/gpt-oss-120b';
export const aiMode = (env: Env): 'workers-ai' | 'local' => (env.AI_MODE === 'local' || !env.AI ? 'local' : 'workers-ai');

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

// the shape of the reply differs between model families; take the text from whichever field carries it
function textOf(r: unknown): string {
  const x = r as any;
  if (typeof x === 'string') return x;
  if (typeof x?.response === 'string') return x.response;
  const ch = x?.choices?.[0];
  if (typeof ch?.message?.content === 'string' && ch.message.content) return ch.message.content;
  if (typeof ch?.text === 'string') return ch.text;
  if (typeof x?.output_text === 'string') return x.output_text;
  if (Array.isArray(x?.output)) {
    for (const o of x.output) if (o?.type === 'message') for (const c of o.content || []) if (typeof c?.text === 'string' && c.text) return c.text;
  }
  throw new Error('the model returned no text');
}

export function codeOf(text: string): string {
  const fenced = [...text.matchAll(/```(?:gt|godtongue)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const src = (fenced.sort((a, b) => b.length - a.length)[0] ?? text).trim();
  if (!/^(--.*\n)*\s*create /m.test(src)) throw new Error('the model did not write a godtongue piece');
  return src + '\n';
}

async function chat(env: Env, messages: Msg[], maxTokens: number): Promise<string> {
  const ai = env.AI as any;
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await ai.run(MODEL(env), { messages, max_tokens: maxTokens, temperature: 0.7, reasoning: { effort: 'low' } });
      return textOf(r);
    } catch (e) {
      last = e;
      const msg = String((e as Error)?.message || e);
      // an older schema without "reasoning": try once more without it
      if (/reasoning|schema|invalid/i.test(msg) && attempt === 0) {
        try { return textOf(await ai.run(MODEL(env), { messages, max_tokens: maxTokens, temperature: 0.7 })); } catch (e2) { last = e2; }
      }
    }
  }
  console.error('workers ai failed', last);
  fail(502, 'the generator is not answering right now; try again in a moment');
}

const DIRECTIONS = [
  'the most direct reading of the brief',
  'a bolder take: stronger material contrast and colour',
  'a different kind of piece than the obvious one (a card, a canvas post, a scene or a short video), if the brief allows',
  'a quiet, minimal take with one precious detail',
  'an ornate, collectible take',
  'a graphic, typographic take',
];

export async function generateSource(env: Env, o: { prompt: string; refs: string[]; uploads: string[]; i: number; n: number }): Promise<string> {
  if (aiMode(env) === 'local') return localGenerate(o.prompt, o.i, o.uploads);
  const parts = [`Brief: ${o.prompt}`];
  if (o.refs.length) parts.push('Reference pieces. Match their style, materials and mood, not their exact content:\n' + o.refs.map((r) => '```gt\n' + r.slice(0, 6000) + '\n```').join('\n'));
  if (o.uploads.length) parts.push(`Images you may print (and only these): ${o.uploads.map((u) => '@' + u).join(', ')}`);
  parts.push(`This is option ${o.i + 1} of ${o.n}: ${DIRECTIONS[o.i % DIRECTIONS.length]}.`);
  parts.push('Reply with one godtongue piece in a single ```gt block and nothing else.');
  const text = await chat(env, [{ role: 'system', content: GUIDE }, { role: 'user', content: parts.join('\n\n') }], 6000);
  try { return codeOf(text); } catch (e) { fail(502, (e as Error).message); }
}

export async function editSource(env: Env, o: { source: string; parts: PartBrief[]; text: string }): Promise<string> {
  if (aiMode(env) === 'local') return localEdit(o.source, o.parts, o.text);
  const numbered = o.source.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
  const parts = o.parts.map((p) => `P${p.n} = "${p.name}"${p.face ? ` (${p.face})` : ''}, lines ${p.lines.join(', ')}`).join('\n');
  const user = [
    'Current source (line numbers on the left are for reference only):', '```', numbered, '```',
    parts ? `Numbered parts the person can refer to (P1 is "p1"):\n${parts}` : '',
    `Change requested: "${o.text}"`,
    'Change only what was asked. Return the complete updated source, without line numbers, in one ```gt block.',
  ].filter(Boolean).join('\n\n');
  const text = await chat(env, [{ role: 'system', content: GUIDE }, { role: 'user', content: user }], 6000);
  try { return codeOf(text); } catch (e) { fail(502, (e as Error).message); }
}

export async function repairSource(env: Env, o: { source: string; diagnostics: Diagnostic[] }): Promise<string> {
  if (aiMode(env) === 'local') fail(422, 'the offline generator cannot repair sources; fix the line in the code box');
  const errs = o.diagnostics.slice(0, 12).map((d) => `line ${d.line ?? '?'}: ${d.msg}${d.hint ? ` (${d.hint})` : ''}`).join('\n');
  const user = ['This godtongue source does not compile:', '```gt', o.source, '```', `Compiler errors:\n${errs}`,
    'Fix only what is needed so it compiles, keeping the design. Return the complete corrected source in one ```gt block.'].join('\n\n');
  const text = await chat(env, [{ role: 'system', content: GUIDE }, { role: 'user', content: user }], 6000);
  try { return codeOf(text); } catch (e) { fail(502, (e as Error).message); }
}
