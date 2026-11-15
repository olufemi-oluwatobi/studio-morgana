// Making a piece from the taste book. The model chooses, fills and writes; code checks every answer.
//   1. taste  (once per brief, the reader sees the images): the book, filtered to the format → an action sheet of picks
//   2. spec   (once per option, the writer): the picked entries in full → an action sheet of words, sizes, art, tweaks
//   3. script (once per option): code fills the template into a draft; the writer writes the godtongue from it:
//        rewrite: the draft moved to the format and the person's tweaks applied, nothing else changed
//        new:     a new piece from scratch in the picked palette, type and spacing, the draft as the standard to meet
//      then the compiler and a layout check; problems go back to the writer; if it still fails, the draft is used
// Replies are action sheets (markdown), never JSON. Every step leaves a trace: what it saw and what it wrote.
import { TASTE } from '../taste.gen';
import { DOCKETS } from '../dockets.gen';
import { withStamps, type LibStamp } from '../library';
import { check } from '../gt/checker.gen.js';
import type { GtChecked } from '../gt/checker.gen.js';
import type { Models } from './models';
import type { Brief } from './create';
import { HOUSE, addCheckLoop, chaptersFor, codeOf, runToEnd, systemFor, wizardOf, type LoopState, type Step } from './common';
import { bookText, canvasOf, choiceText, chosenOf, detectFormat, fillTemplate, filterBook, fitPass, layoutIssues, tidyPicks, tidySpec, ROLES, type Book, type Chosen, type Format, type Pick, type Spec } from '../taste/fill';
import { readPicksSheet, readSpecSheet } from '../taste/sheet';

export interface Trace { step: string; by: 'model' | 'code'; ms: number; note: string; sees?: string; images?: string[]; writes?: string }

const refsText = (b: Brief) => {
  const looks = b.looksLike ?? [], assets = b.assets ?? [];
  return [
    looks.length ? `Style references (attached; match their look, never print them):\n${looks.map((r) => `- ${r.name}${r.meta?.w ? `, ${r.meta.w} by ${r.meta.h}` : ''}${r.meta?.palette?.length ? `, measured colours ${r.meta.palette.slice(0, 6).join(' ')}` : ''}`).join('\n')}` : 'No style references.',
    assets.length ? `Files the person uploaded to print:\n${assets.map((a) => `- @${a.name}${a.label ? ` (${a.label})` : ''}${a.w ? `, ${a.w} by ${a.h}` : ''}${a.palette.length ? `, colours ${a.palette.slice(0, 4).join(' ')}` : ''}`).join('\n')}` : 'No uploaded files.',
  ].join('\n\n');
};

export const formatText = (f: Format) => {
  const s = f.safe, any = s.top || s.bottom || s.left || s.right;
  return `${f.name}, ${f.size[0]} by ${f.size[1]} (${f.ratio}). ${f.description}${any ? ` Safe area: keep text ${s.top} px from the top, ${s.bottom} from the bottom, ${s.left} from the left and ${s.right} from the right.` : ''}`;
};

// ── step 1: choose from the book ─────────────────────────────────────────────────────────────────────────────────
export interface TasteFilters { format?: string; tags?: string[] }

export function tastePrompt(b: Brief, n: number, book: Book, o: { format?: Format; notes?: string[] } = {}): string {
  return [
    'You are the art director at Studio Morgana. Every piece starts from our taste book: one of our palettes, type systems and spacing systems, and one of our templates, either rewritten for the brief or used as the standard for a new layout. Right now you only choose.',
    `The brief: "${b.prompt}"`,
    `Make ${n} option${n > 1 ? 's' : ''}.`,
    o.format ? `# Format\n${formatText(o.format)}` : `# Formats (choose one: the brief does not name it)\n${book.formats.map((f) => `- ${f.id}: ${formatText(f)}`).join('\n')}`,
    refsText(b),
    `# The taste book${o.notes?.length ? ` (filtered: ${o.notes.join('; ')})` : ''}`,
    bookText(book),
    [
      'How to choose:',
      '- Read the brief for its subject, its audience and its mood; match them to the descriptions and tags.',
      '- If there are style references, match their colours, type and layout as closely as the book allows: compare the measured colours with the palettes\' hex values.',
      '- A template takes only the type systems and spacing systems it lists.',
      '- mode: "rewrite" when the template\'s layout suits the brief (its words, sizes and art change; the person\'s small asks are applied); "new" when no template\'s layout suits it: the template is then only the standard to meet, and a new layout is written in the chosen palette, type and spacing.',
      '- Make the options differ: at least a different palette each; a different template or type system where more than one fits.',
      '- In "why", name what in the brief or the reference made you choose it.',
    ].join('\n'),
    [
      'Reply with an action sheet, in markdown, and nothing else:',
      ...(o.format ? [] : ['# Format', 'format: <format id>', '']),
      '# Option 1', 'template: <template id>', 'mode: rewrite | new', 'palette: <palette id>', 'type: <type system id>', 'spacing: <spacing id>', 'why: <one sentence>',
      '', `# Option 2 … (${n} in all)`,
    ].join('\n'),
  ].join('\n\n');
}

export async function chooseFromBook(models: Models, b: Brief, n: number, f: TasteFilters = {}, full: Book = TASTE): Promise<{ picks: Pick[]; format: Format; trace: Trace }> {
  const t0 = Date.now();
  let format = f.format ? full.formats.find((x) => x.id === f.format) : detectFormat(b.prompt, full.formats);
  const found = format && !f.format ? `format "${format.id}" from the brief's words` : format ? `format "${format.id}" chosen by the person` : '';
  const filtered = filterBook(full, { format, tags: f.tags, brief: b.prompt });
  const prompt = tastePrompt(b, n, filtered.book, { format, notes: filtered.notes });
  const images = [...(b.looksLike ?? []), ...b.images].slice(0, 4);
  let reply = '';
  try { reply = await models.read({ prompt, images, maxTokens: 900 }); }
  catch (e) { console.error('taste step failed', e); }
  const sheet = readPicksSheet(reply);
  // checked against the whole book: a real entry the filter left out is still a real entry
  const { picks, notes } = tidyPicks({ picks: sheet.picks }, full, n, filtered.book);
  if (!format) format = full.formats.find((x) => x.id === sheet.format);
  const chosenBy = format && !found ? `format "${format.id}" chosen by the model` : found;
  // no format anywhere: the first template's own
  if (!format) format = full.formats.find((x) => x.id === full.templates.find((t) => t.id === picks[0].template)?.formats[0]) ?? full.formats[0];
  return {
    picks, format,
    trace: { step: 'taste', by: 'model', ms: Date.now() - t0, sees: prompt, images: images.map((i) => i.name || 'image'), writes: reply,
      note: [chosenBy || `format "${format.id}" by default`, picks.map((p) => `${p.option}: ${p.template} (${p.mode}) · ${p.palette} · ${p.type} · ${p.spacing}`).join('; '), ...filtered.notes, ...notes].join(' | ') },
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
    `You write the spec for option ${o.i + 1} of ${o.n} at Studio Morgana. The template, palette, type and spacing are chosen. You write the words for its slots, choose its sizes from the scale, choose its art, and list any tweaks: what the brief asks for that the slots do not cover.`,
    `The brief: "${b.prompt}"`,
    c.format ? `The format: ${formatText(c.format)}` : '',
    `Why this option was chosen: ${pick.why || '(no reason given)'}${pick.mode === 'new' ? ' A new layout will be written for it; the template\'s slots still hold the words.' : ''}`,
    choiceText(c, guideOf(c.template.guide)),
    [
      'Art: one of',
      '- shapes: the template\'s own shapes',
      stamps.length ? `- stamp: one drawing from our library, recoloured to the palette: ${stamps.map((s) => `${s.slug} (${s.words.slice(0, 3).join(', ') || s.name})`).join('; ')}` : '- stamp: none fit this brief',
      assets.length ? `- asset: one of the person's files: ${assets.map((a) => '@' + a.name).join(', ')}` : '- asset: the person uploaded none',
    ].join('\n'),
    [
      'Rules:',
      '- Use the brief\'s real facts (names, dates, places, prices). Where a slot needs a fact the brief does not give, write something plausible that fits; never a placeholder ("TBD", "[date]", "Lorem").',
      '- Count the characters: every line within its limit. Shorter lines set bigger.',
      '- Do not repeat the headline in the small slots; each slot says something new.',
      '- Prefer the person\'s file, then a stamp that is the brief\'s subject, then the template\'s shapes.',
      '- Tweaks are only what the person asked for in their own words (a square instead of a circle, the logo bigger, no grain); write "- none" if they asked for nothing beyond the words.',
    ].join('\n'),
    [
      'Reply with an action sheet, in markdown, and nothing else:',
      '# Spec',
      ...c.template.slots.flatMap((s) => [`## ${s.name}`, ...Array.from({ length: s.lines }, (_, k) => `- <line ${k + 1}>`)]),
      '## sizes', ...Object.keys(c.template.sizes).map((k) => `${k}: <a size from its scale>`),
      '## art', 'use: shapes | stamp | asset', 'stamp: <slug, if stamp>', 'asset: <file name, if asset>',
      '## tweaks', '- <one change the person asked for, or "none">',
      '## why', '<one sentence>',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

// ── step 3: the draft, by code ───────────────────────────────────────────────────────────────────────────────────
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
  let cur: Spec = spec, source = '', checked!: GtChecked;
  for (let pass = 0; pass < 4; pass++) {
    source = withStamp(fillTemplate(c, cur), c, cur, stamps);
    checked = check(source, files);
    if (!checked.ok) break;
    const f = fitPass(c, cur, checked);
    if (!f.changed) break;
    cur = f.spec; notes.push(...f.notes);
  }
  return { source, checked, spec: cur, notes };
}

// ── step 3: the writer ───────────────────────────────────────────────────────────────────────────────────────────
export function writerPrompt(b: Brief, pick: Pick, c: Chosen, spec: Spec, draft: string, o: { i: number; n: number }): string {
  const { W, H, native } = canvasOf(c);
  const f = c.format;
  const target = f ? `${f.size[0]} by ${f.size[1]}` : `${W} by ${H}`;
  const words = c.template.slots.map((s) => `  - ${s.name}: ${spec.texts[s.name].map((l) => `"${l}"`).join(' / ')}`).join('\n');
  const tweaks = spec.tweaks.length ? spec.tweaks.map((t) => '  - ' + t).join('\n') : '';
  if (pick.mode === 'new') return [
    `You write godtongue for Studio Morgana: option ${o.i + 1} of ${o.n}, a new layout.`,
    `The brief: "${b.prompt}"`,
    f ? `The format: ${formatText(f)}` : '',
    'No template of ours has the right layout for this brief, so write a new piece from scratch, in our taste:',
    `- Canvas: a flat canvas ${target}.`,
    `- Palette (these colours only, in these roles): ${ROLES.map((r) => `${r} ${c.palette.roles[r].hex} (${c.palette.roles[r].use})`).join('; ')}.${c.palette.rules.length ? ' Rules: ' + c.palette.rules.join('; ') + '.' : ''}`,
    `- Type: ${c.type.display.font} ${c.type.display.weight} for display${c.type.display.case === 'upper' ? ' in capitals' : ''}, tracking ${Math.round(c.type.display.tracking * 100)}% of the size, line step ${c.type.display.leading} of the size; ${c.type.label.font} ${c.type.label.weight} in capitals for labels. Sizes from ${JSON.stringify(c.type.scale)}. These two fonts only.`,
    `- Spacing: ${c.spacing.description}`,
    `- The words, exactly as written:\n${words}`,
    `- Art: ${spec.art.use === 'stamp' ? `place the library drawing "${spec.art.stamp}" (it is defined for you: write "place a ${spec.art.stamp} at x y, size N")` : spec.art.use === 'asset' ? `print @${spec.art.asset}` : 'flat shapes in the palette'}.`,
    tweaks ? `- The person also asked:\n${tweaks}` : '',
    `Here is one of our templates filled with these words, as the standard to meet (craft, scale, restraint); do not copy its layout:\n\`\`\`gt\n${draft.trim()}\n\`\`\``,
    'Rules: every text element gets a name (headline-1, headline-2 …, then the slot names); text stays inside the canvas and the safe area; only shapes may bleed off the edge; write in plain English ("Let there be …", "Write … called …").',
    'Reply with the whole piece in one ```gt block and nothing else.',
  ].filter(Boolean).join('\n\n');
  return [
    `You write godtongue for Studio Morgana: option ${o.i + 1} of ${o.n}.`,
    `The brief: "${b.prompt}"`,
    f ? `The format: ${formatText(f)}` : '',
    `## The draft\nOur template "${c.template.name}", filled with this option's words, palette, type and spacing by code. It compiles.${native ? '' : ` It is drawn at ${W} by ${H}; the format is ${target}.`}\n\`\`\`gt\n${draft.trim()}\n\`\`\``,
    [
      '## What to do',
      native ? '' : `- Move it to the format: make the canvas ${target}, then move and resize every element so the layout keeps its proportions (margins, the headline's share of the width, where each group sits) and all text stays inside the canvas${f && (f.safe.top || f.safe.bottom) ? ' and the safe area' : ''}.`,
      tweaks ? `- Apply what the person asked:\n${tweaks}` : '',
      '- Keep everything else exactly as it is: the same elements and names, the same words, fonts, colours and order. Add or remove nothing that a line above does not ask for.',
    ].filter(Boolean).join('\n'),
    'Reply with the whole piece in one ```gt block and nothing else.',
  ].filter(Boolean).join('\n\n');
}

// ── one option: spec, draft, writer, checks ──────────────────────────────────────────────────────────────────────
export interface MadeFromBook { source: string; ok: boolean; checked: GtChecked; rounds: number; trail: Step[]; trace: Trace[]; spec: Spec; pick: Pick; wrote: 'writer' | 'draft' }

export async function makeFromBook(models: Models, o: { brief: Brief; pick: Pick; format?: Format; i: number; n: number; files: Record<string, Uint8Array>; rounds: number; stamps: LibStamp[]; book?: Book }): Promise<MadeFromBook> {
  const book = o.book ?? TASTE, c = chosenOf(book, o.pick, o.format), trace: Trace[] = [], trail: Step[] = [];
  const allowed = { stamps: o.stamps.map((s) => s.slug), assets: (o.brief.assets ?? []).map((a) => a.name) };
  const slots = c.template.slots.map((s) => s.name);

  // step 2: the spec, said back once if it breaks the rules
  let t0 = Date.now();
  const prompt = specPrompt(o.brief, o.pick, c, o.stamps, o);
  let reply = await models.write({ prompt, temperature: 0.6, maxTokens: 900 });
  let { spec, errors } = tidySpec(readSpecSheet(reply, slots), c, allowed);
  trace.push({ step: 'spec', by: 'model', ms: Date.now() - t0, sees: prompt, writes: reply, note: errors.length ? `${errors.length} problem${errors.length > 1 ? 's' : ''}: ${errors.join('; ')}` : 'spec accepted' });
  if (errors.length) {
    t0 = Date.now();
    const again = `${prompt}\n\nYour last sheet:\n${reply.trim()}\n\nIt has these problems:\n${errors.map((e) => '- ' + e.replace(/^texts\./, '')).join('\n')}\n\nReply with the corrected action sheet only.`;
    reply = await models.write({ prompt: again, temperature: 0.3, maxTokens: 900 });
    const second = tidySpec(readSpecSheet(reply, slots), c, allowed);
    if (second.errors.length <= errors.length) ({ spec, errors } = second);
    trace.push({ step: 'spec (corrected)', by: 'model', ms: Date.now() - t0, sees: '(the same prompt, with its last sheet and the list of problems)', writes: reply, note: errors.length ? `still ${errors.length}; repaired by code: ${errors.join('; ')}` : 'spec accepted' });
  }
  trail.push({ step: 'spec', by: 'writer', ms: trace.reduce((a, t) => a + t.ms, 0), note: `${c.template.id} (${o.pick.mode}), ${c.palette.id}, ${c.type.id}; art ${spec.art.use}${spec.art.stamp ? ' ' + spec.art.stamp : ''}${spec.art.asset ? ' @' + spec.art.asset : ''}${spec.tweaks.length ? `; ${spec.tweaks.length} tweak${spec.tweaks.length > 1 ? 's' : ''}` : ''}` });

  // step 3a: code fills the template into a draft
  t0 = Date.now();
  const d = writeScript(c, spec, o.stamps, o.files);
  const { native } = canvasOf(c);
  trace.push({ step: 'draft', by: 'code', ms: Date.now() - t0, writes: d.source, note: `${d.source.split('\n').length} lines; ${d.checked.ok ? 'compiles' : 'does not compile'}${d.notes.length ? '; fitted: ' + d.notes.join('; ') : ''}` });

  // step 3b: the writer, when there is something to write: a new layout, a move to the format, the person's tweaks
  const why = [o.pick.mode === 'new' ? 'a new layout' : '', native ? '' : `moving it to ${c.format?.name}`, spec.tweaks.length ? `${spec.tweaks.length} tweak${spec.tweaks.length > 1 ? 's' : ''}` : '', d.checked.ok ? '' : 'the draft does not compile'].filter(Boolean);
  const draftResult = (note: string): MadeFromBook => {
    trail.push({ step: 'script', by: 'compiler', ms: Date.now() - t0, note });
    return { source: d.source, ok: d.checked.ok, checked: d.checked, rounds: 0, trail, trace, spec: d.spec, pick: o.pick, wrote: 'draft' };
  };
  if (!why.length) {
    trace.push({ step: 'write', by: 'code', ms: 0, note: 'nothing to rewrite: the draft is the piece' });
    return draftResult('the draft is the piece');
  }
  t0 = Date.now();
  const system = systemFor(chaptersFor([], { kind: 'canvas' })) + '\n\n' + HOUSE;
  const wp = writerPrompt(o.brief, o.pick, c, d.spec, d.source, o);
  let written = '';
  try { written = codeOf(await models.write({ system, prompt: wp, temperature: o.pick.mode === 'new' ? 0.7 : 0.3 })) ?? ''; }
  catch (e) { console.error('writer failed', e); }
  if (!written) { trace.push({ step: 'write', by: 'model', ms: Date.now() - t0, sees: wp, writes: '', note: 'no godtongue in the reply; using the draft' }); return draftResult('the writer wrote nothing; the draft is the piece'); }
  const source0 = withStamps(written, o.stamps);
  trace.push({ step: 'write', by: 'model', ms: Date.now() - t0, sees: wp, writes: source0, note: `${why.join(', ')}; ${source0.split('\n').length} lines` });

  // compile errors go back to the writer (the fix loop), then layout problems once
  t0 = Date.now();
  const w = wizardOf(models);
  w.addComputeStep({ id: 'start', handler: () => w.signal.skip });
  addCheckLoop(w, models, () => wp);
  const out = await runToEnd<LoopState>(w, { source: source0, system, files: o.files, rounds: Math.max(1, o.rounds), round: 0, trail: [] });
  let source = out.source, checked = out.checked!;
  if (out.round) trace.push({ step: 'fix', by: 'model', ms: Date.now() - t0, sees: 'the piece, the compiler\'s errors and the manual', writes: source, note: checked.ok ? `compiles after ${out.round} round${out.round === 1 ? '' : 's'}` : 'still does not compile' });
  if (checked.ok) {
    const issues = layoutIssues(checked, c.format);
    if (issues.length) {
      t0 = Date.now();
      const lp = `${wp}\n\nYour piece:\n\`\`\`gt\n${source.trim()}\n\`\`\`\n\nIt compiles, but on the page:\n${issues.map((x) => '- ' + x).join('\n')}\n\nFix these and change nothing else. Reply with the whole piece in one \`\`\`gt block.`;
      const again = codeOf(await models.write({ system, prompt: lp, temperature: 0.2 }).catch(() => '')) ?? '';
      const c2 = again ? check(withStamps(again, o.stamps), o.files) : null;
      const left = c2?.ok ? layoutIssues(c2, c.format) : null;
      if (c2?.ok && left && left.length < issues.length) { source = withStamps(again, o.stamps); checked = c2; }
      trace.push({ step: 'layout', by: 'model', ms: Date.now() - t0, sees: issues.join('; '), writes: again, note: c2?.ok && left && left.length < issues.length ? `${issues.length} problem${issues.length > 1 ? 's' : ''} → ${left.length}` : `kept the earlier piece (${issues.length} problem${issues.length > 1 ? 's' : ''})` });
    }
  }
  trail.push(...out.trail);
  if (!checked.ok) {
    trace.push({ step: 'fallback', by: 'code', ms: 0, note: 'the writer\'s piece does not compile; using the draft' });
    return draftResult('the writer\'s piece did not compile; the draft is the piece');
  }
  trail.push({ step: 'script', by: 'writer', ms: Date.now() - t0, note: why.join(', ') });
  return { source, ok: true, checked, rounds: out.round ?? 0, trail, trace, spec: d.spec, pick: o.pick, wrote: 'writer' };
}

export { detectFormat, layoutIssues };
