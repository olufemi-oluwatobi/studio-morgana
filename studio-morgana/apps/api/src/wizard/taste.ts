// Making a piece from the taste book. The model never designs; it chooses and it fills.
//   1. taste  (once per brief, the reader sees the images): the whole book in context → one pick per option
//   2. spec   (once per option, the writer):                the picked entries in full → the words, sizes and art
//   3. script (once per option, code):                      the template filled, text fitted, compiled
//      the writer only sees step 3 if the compiler rejects it (the fix loop)
// Every step leaves a trace: what it saw and what it wrote, for the log and for showing the flow.
import { TASTE } from '../taste.gen';
import { DOCKETS } from '../dockets.gen';
import type { LibStamp } from '../library';
import { check } from '../gt/checker.gen.js';
import type { GtChecked } from '../gt/checker.gen.js';
import type { Models } from './models';
import type { Brief } from './create';
import { addCheckLoop, chaptersFor, extractJson, runToEnd, systemFor, wizardOf, type LoopState, type Step } from './common';
import { bookText, choiceText, chosenOf, fillTemplate, tidyPicks, tidySpec, widthOf, type Book, type Chosen, type Pick, type Spec } from '../taste/fill';

export interface Trace { step: string; by: 'model' | 'code'; ms: number; note: string; sees?: string; images?: string[]; writes?: string }

const refsText = (b: Brief) => {
  const looks = b.looksLike ?? [], assets = b.assets ?? [];
  return [
    looks.length ? `Style references (attached; match their look, never print them):\n${looks.map((r) => `- ${r.name}${r.meta?.w ? `, ${r.meta.w} by ${r.meta.h}` : ''}${r.meta?.palette?.length ? `, measured colours ${r.meta.palette.slice(0, 6).join(' ')}` : ''}`).join('\n')}` : 'No style references.',
    assets.length ? `Files the person uploaded to print:\n${assets.map((a) => `- @${a.name}${a.label ? ` (${a.label})` : ''}${a.w ? `, ${a.w} by ${a.h}` : ''}${a.palette.length ? `, colours ${a.palette.slice(0, 4).join(' ')}` : ''}`).join('\n')}` : 'No uploaded files.',
  ].join('\n\n');
};

// ── step 1: choose from the book ─────────────────────────────────────────────────────────────────────────────────
export function tastePrompt(b: Brief, n: number, book: Book = TASTE): string {
  return [
    'You are the art director at Studio Morgana. We do not design from scratch: every piece is one of our templates, in one of our palettes, type systems and spacing systems, filled with the client\'s words. Right now you only choose.',
    `The brief: "${b.prompt}"`,
    `Make ${n} option${n > 1 ? 's' : ''}.`,
    refsText(b),
    '# The taste book: everything you may choose from',
    bookText(book),
    [
      'How to choose:',
      '- Read the brief for its subject, its audience and its mood; match them to the descriptions and tags.',
      '- If there are style references, match their colours, type and layout as closely as the book allows: compare the measured colours with the palettes\' hex values.',
      '- A template takes only the type systems and spacing systems it lists.',
      '- Make the options differ: at least a different palette each; a different template or type system where more than one fits the brief.',
      '- In "why", name what in the brief or the reference made you choose it.',
    ].join('\n'),
    `Reply with JSON only:\n{"picks":[{"option":1,"template":"<template id>","palette":"<palette id>","type":"<type system id>","spacing":"<spacing id>","why":"one sentence"}, … ${n} in all]}`,
  ].join('\n\n');
}

export async function chooseFromBook(models: Models, b: Brief, n: number, book: Book = TASTE): Promise<{ picks: Pick[]; trace: Trace }> {
  const t0 = Date.now(), prompt = tastePrompt(b, n, book);
  const images = [...(b.looksLike ?? []), ...b.images].slice(0, 4);
  let reply = '';
  try { reply = await models.read({ prompt, images, maxTokens: 900 }); }
  catch (e) { reply = ''; console.error('taste step failed', e); }
  const { picks, notes } = tidyPicks(extractJson(reply) ?? {}, book, n);
  return {
    picks,
    trace: { step: 'taste', by: 'model', ms: Date.now() - t0, sees: prompt, images: images.map((i) => i.name || 'image'), writes: reply, note: [picks.map((p) => `${p.option}: ${p.template} · ${p.palette} · ${p.type} · ${p.spacing}`).join('; '), ...notes].join(' | ') },
  };
}

// ── step 2: the spec for one option ──────────────────────────────────────────────────────────────────────────────
// the parts of the template's docket that bear on words and sizes; its palette and image recipes are already decided
const GUIDE_SECTIONS = ['Look', 'Type', 'Signature', "Don't"];
const guideOf = (id: string) => {
  const d = DOCKETS.find((x) => x.id === id);
  if (!d) return '';
  return d.text.split(/^(?=## )/m).filter((sec) => GUIDE_SECTIONS.some((h) => sec.startsWith(`## ${h}`)))
    .map((sec) => sec.replace(/```[\s\S]*?```/g, '').trim()).join('\n\n');
};

export function specPrompt(b: Brief, pick: Pick, c: Chosen, stamps: LibStamp[], o: { i: number; n: number }): string {
  const assets = b.assets ?? [];
  return [
    `You write the spec for option ${o.i + 1} of ${o.n} at Studio Morgana. You do not design: the template below is designed, and its palette, type and spacing are chosen. You write the words for its slots, choose its sizes from the scale, and choose its art.`,
    `The brief: "${b.prompt}"`,
    `Why this option was chosen: ${pick.why || '(no reason given)'}`,
    choiceText(c, guideOf(c.template.guide)),
    [
      'Art: one of',
      '- "shapes": the template\'s own shapes',
      stamps.length ? `- "stamp": one drawing from our library, recoloured to the palette: ${stamps.map((s) => `${s.slug} (${s.words.slice(0, 3).join(', ') || s.name})`).join('; ')}` : '- "stamp": none fit this brief',
      assets.length ? `- "asset": one of the person's files: ${assets.map((a) => '@' + a.name).join(', ')}` : '- "asset": the person uploaded none',
    ].join('\n'),
    [
      'Rules:',
      '- Use the brief\'s real facts (names, dates, places, prices). Where a slot needs a fact the brief does not give, write something plausible that fits; never a placeholder ("TBD", "[date]", "Lorem").',
      '- Count the characters: every line within its limit. Shorter lines set bigger.',
      '- Do not repeat the headline in the small slots; each slot says something new.',
      '- Prefer the person\'s file, then a stamp that is the brief\'s subject, then the template\'s shapes.',
    ].join('\n'),
    `Reply with JSON only:\n{"texts":{${c.template.slots.map((s) => `"${s.name}":[${Array.from({ length: s.lines }, () => '"…"').join(',')}]`).join(',')}},"sizes":{${Object.keys(c.template.sizes).map((k) => `"${k}":<a size from its scale>`).join(',')}},"art":{"use":"shapes"|"stamp"|"asset","stamp":"<slug, if stamp>","asset":"<file name, if asset>"},"why":"one sentence"}`,
  ].join('\n\n');
}

// ── step 3: the script, by code ──────────────────────────────────────────────────────────────────────────────────
// The stamp's definition goes in front, recoloured to the template's ink for it.
function withStamp(source: string, c: Chosen, spec: Spec, stamps: LibStamp[]): string {
  if (spec.art.use !== 'stamp') return source;
  const s = stamps.find((x) => x.slug === spec.art.stamp);
  if (!s) return source;
  const hex = c.palette.roles[c.template.art.stampInk ?? 'second'].hex;
  return s.gt.replace(/#1d1b2e/gi, hex).trimEnd() + '\n' + source;
}

// Fill, compile, and shrink any size whose lines run wider than they may; three passes at most.
export function writeScript(c: Chosen, spec: Spec, stamps: LibStamp[], files: Record<string, Uint8Array> = {}): { source: string; checked: GtChecked; spec: Spec; notes: string[] } {
  const notes: string[] = [];
  let cur: Spec = { ...spec, sizes: { ...spec.sizes } };
  let source = '', checked!: GtChecked;
  const W = c.template.size[0], margin = Math.round(W * c.spacing.margin);
  for (let pass = 0; pass < 4; pass++) {
    source = withStamp(fillTemplate(c, cur), c, cur, stamps);
    checked = check(source, files);
    if (!checked.ok) break;
    let changed = false;
    for (const [k, s] of Object.entries(c.template.sizes)) {
      const max = widthOf(s, W, margin);
      const widest = Math.max(0, ...s.elements.map((e) => { const b = checked.elements[e]?.box; return b ? b[2] - b[0] : 0; }));
      if (widest > max + 1) {
        const was = cur.sizes[k] ?? s.default, now = Math.max(8, Math.floor(was * (max / widest) * 10) / 10);
        cur.sizes[k] = now; changed = true;
        notes.push(`${k}: ${Math.round(widest)}px wide at size ${was}, allowed ${Math.round(max)}px → size ${now}`);
      }
    }
    if (!changed) break;
  }
  return { source, checked, spec: cur, notes };
}

// ── one option: spec, then script ────────────────────────────────────────────────────────────────────────────────
export interface MadeFromBook { source: string; ok: boolean; checked: GtChecked; rounds: number; trail: Step[]; trace: Trace[]; spec: Spec; pick: Pick }

export async function makeFromBook(models: Models, o: { brief: Brief; pick: Pick; i: number; n: number; files: Record<string, Uint8Array>; rounds: number; stamps: LibStamp[]; book?: Book }): Promise<MadeFromBook> {
  const book = o.book ?? TASTE, c = chosenOf(book, o.pick), trace: Trace[] = [], trail: Step[] = [];
  const allowed = { stamps: o.stamps.map((s) => s.slug), assets: (o.brief.assets ?? []).map((a) => a.name) };

  // step 2: the spec, said back once if it breaks the rules
  let t0 = Date.now();
  const prompt = specPrompt(o.brief, o.pick, c, o.stamps, o);
  let reply = await models.write({ prompt, temperature: 0.6, maxTokens: 900 });
  let { spec, errors } = tidySpec(extractJson(reply) ?? {}, c, allowed);
  trace.push({ step: 'spec', by: 'model', ms: Date.now() - t0, sees: prompt, writes: reply, note: errors.length ? `${errors.length} problem${errors.length > 1 ? 's' : ''}: ${errors.join('; ')}` : 'spec accepted' });
  if (errors.length) {
    t0 = Date.now();
    const again = `${prompt}\n\nYour last spec:\n${reply.trim()}\n\nIt has these problems:\n${errors.map((e) => '- ' + e).join('\n')}\n\nReply with the corrected JSON only.`;
    reply = await models.write({ prompt: again, temperature: 0.3, maxTokens: 900 });
    const second = tidySpec(extractJson(reply) ?? {}, c, allowed);
    // the second answer is used if it is at least as good; what still breaks the rules is repaired by code
    if (second.errors.length <= errors.length) ({ spec, errors } = second);
    trace.push({ step: 'spec (corrected)', by: 'model', ms: Date.now() - t0, sees: '(the same prompt, with its last spec and the list of problems)', writes: reply, note: errors.length ? `still ${errors.length}; repaired by code: ${errors.join('; ')}` : 'spec accepted' });
  }
  trail.push({ step: 'spec', by: 'writer', ms: trace.reduce((a, t) => a + t.ms, 0), note: `${c.template.id}, ${c.palette.id}, ${c.type.id}; art ${spec.art.use}${spec.art.stamp ? ' ' + spec.art.stamp : ''}${spec.art.asset ? ' @' + spec.art.asset : ''}` });

  // step 3: code writes the script
  t0 = Date.now();
  const s = writeScript(c, spec, o.stamps, o.files);
  trace.push({ step: 'script', by: 'code', ms: Date.now() - t0, writes: s.source, note: `${s.source.split('\n').length} lines; ${s.checked.ok ? 'compiles' : 'does not compile'}${s.notes.length ? '; fitted: ' + s.notes.join('; ') : ''}` });
  trail.push({ step: 'script', by: 'compiler', ms: Date.now() - t0, note: s.checked.ok ? `compiles${s.notes.length ? '; ' + s.notes.join('; ') : ''}` : 'does not compile; asking the writer to fix it' });
  if (s.checked.ok) return { source: s.source, ok: true, checked: s.checked, rounds: 0, trail, trace, spec: s.spec, pick: o.pick };

  // only now does the model see godtongue: the compiler's errors, to fix
  t0 = Date.now();
  const w = wizardOf(models);
  w.addComputeStep({ id: 'start', handler: () => w.signal.skip });
  addCheckLoop(w, models, () => `This piece was written from our template "${c.template.name}". Make it compile and change nothing else.`);
  const out = await runToEnd<LoopState>(w, { source: s.source, system: systemFor(chaptersFor([], { kind: 'canvas' })), files: o.files, rounds: Math.max(1, o.rounds), round: 0, trail: [] });
  trace.push({ step: 'fix', by: 'model', ms: Date.now() - t0, sees: 'the script, the compiler\'s errors and the manual', writes: out.source, note: out.checked?.ok ? `fixed in ${out.round} round${out.round === 1 ? '' : 's'}` : 'still does not compile' });
  return { source: out.source, ok: !!out.checked?.ok, checked: out.checked!, rounds: out.round ?? 0, trail: [...trail, ...out.trail], trace, spec: s.spec, pick: o.pick };
}
