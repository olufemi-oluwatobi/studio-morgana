// Making a piece from a brief, in two wizards.
//   plan (once per brief):  look (reader sees the images) → plan (reader breaks the brief down) → manual (reader picks chapters)
//   write (once per option): write (writer, from the plan and the chapters) → check → fix → check … → done
// The options share one plan and differ by direction, so four options cost one plan and four writes.
import type { Chapter } from '../manual.gen';
import { DOCKETS, type Docket } from '../dockets.gen';
import { stampList, withStamps, type LibStamp } from '../library';
import type { GtChecked } from '../gt/checker.gen.js';
import type { Img, Models } from './models';
import type { AssetInfo } from '../ai';
import type { Format, Pick } from '../taste/fill';
import type { Trace } from './taste';
import { HOUSE, addCheckLoop, chaptersFor, codeOf, contents, errorsOf, extractJson, runToEnd, stamp, systemFor, wizardOf, type LoopState, type Step } from './common';

export interface Brief {
  prompt: string;
  refs: string[];                                   // sources of pieces to take the style from
  images: Img[];                                    // the assets the reader can see (raster images the piece may print)
  assets?: AssetInfo[];                             // every asset the piece may print (logos and SVGs too), with what was measured
  looksLike: Img[];                                 // pictures to take the style from: finished pieces and loose inspiration (never printed)
  dockets?: string[];                               // looks the person chose themselves (docket ids); otherwise the reader picks
}
export interface Plan {
  kind: 'canvas' | 'card' | 'stage' | 'video';
  title: string; size?: [number, number]; flat?: boolean; seconds?: number;
  mood: string; palette: { name: string; hex: string }[]; fonts: string[];
  elements: { name: string; what: string; where: string }[];
  images: { file: string; use: string }[];
  notes: string;
  dockets: string[];                                // the looks to build on (docket ids), best first
  slots: Record<string, string>;                    // what the brief fills in each look
  missing: string[];                                // what the brief does not say that the look needs
}
export interface Planned { plan: Plan; chapters: Chapter[]; looks: string; trail: Step[]; dockets: Docket[]; breakdowns?: Breakdown[]; picks?: Pick[]; format?: Format; tasteTrace?: Trace }

const PLAN_SHAPE = `{
  "kind": "canvas" | "card" | "stage" | "video",
  "title": "a short name, lowercase-with-hyphens",
  "size": [width, height] in pixels (a canvas or video; a card is always 1240 by 1829),
  "flat": true for graphic design with exact colours, false for a lit physical object (metal, relief, sprays),
  "seconds": length of a video, else null,
  "mood": "one sentence",
  "palette": [{ "name": "ink", "hex": "#0b0b10" }, … 3 to 6 colours],
  "fonts": ["one to three font names from the list"],
  "elements": [{ "name": "hyphenated-name", "what": "what it is and how it looks", "where": "where it sits, in words (in, under, beside, at the top left …)" }, … in painting order, back first],
  "images": [{ "file": "name.jpg", "use": "where the image goes and how it is treated" }],
  "notes": "anything else the writer must know: materials, effects, motion",
  "dockets": ["one or two look ids from the list that fit the brief, best first; [] when none fits"],
  "slots": { "headline": "…", "…": "what the brief gives for each thing the chosen look varies" },
  "missing": ["anything the look needs that the brief does not say (a date, a name, a photo …)"]
}`;

// the looks we make well, one line each, for the reader to choose from
export const docketIndex = () => DOCKETS.map((d) => `- ${d.id}: ${d.name}. Use when: ${d.use}. Kinds: ${d.kinds}. Size: ${d.size}. Tags: ${d.tags}.`).join('\n');

// ── system 1: a style reference taken apart, layer by layer ─────────────────────────────────────────────────────
// The reader lists the layers (back to front) with boxes as percentages of the canvas; the browser measured the
// image's size and palette, which are exact. The writer rebuilds the structure with the brief's own words and assets.
export interface RefLayer {
  kind: string; role: string; text?: string; box: [number, number, number, number];
  font?: { class?: string; nearest?: string; size_pct_w?: number; case?: string; tracking?: string; leading?: number; align?: string };
  colour?: string; blend?: string; bleeds?: string[]; notes?: string;
}
export interface Breakdown { ref: string; size: [number, number] | null; palette: string[]; ground: string; layers: RefLayer[]; laws: string[] }

const BREAKDOWN_SHAPE = `{
  "ground": "#hex of the background",
  "layers": [ back to front, every visible thing, including small labels:
    { "kind": "text" | "image" | "shape" | "texture",
      "role": "headline | subhead | label | body | logo | photo | illustration | block | rule | pattern …",
      "text": "the words, for reference only",
      "box": [left, top, width, height] as percentages of the canvas width and height (0–100),
      "font": { "class": "bold serif | condensed sans | geometric sans | mono | script | display …", "nearest": "the closest font from the list",
                "size_pct_w": the font size as a percentage of the canvas width, "case": "upper | title | sentence",
                "tracking": "tight | normal | wide", "leading": line step as a multiple of the size, "align": "left | center | right" },
      "colour": "#hex", "blend": "normal | multiply | screen …",
      "bleeds": ["left" | "right" | "top" | "bottom" edges it runs off],
      "notes": "anything else: treatment, rotation, what it overlaps" } ],
  "laws": ["the rules the layout obeys, with numbers: margins as % of width, the edges things align to, columns, size ratios, overlaps …"]
}`;

export function tidyBreakdown(j: any, ref: Img): Breakdown {
  const pct = (v: unknown) => Math.max(-20, Math.min(120, Number(v) || 0));
  const layers: RefLayer[] = (Array.isArray(j?.layers) ? j.layers : []).slice(0, 40).map((l: any) => ({
    kind: String(l?.kind || 'shape'), role: String(l?.role || ''), text: l?.text ? String(l.text).slice(0, 120) : undefined,
    box: (Array.isArray(l?.box) && l.box.length === 4 ? l.box.map(pct) : [0, 0, 100, 100]) as [number, number, number, number],
    font: l?.font && typeof l.font === 'object' ? { class: l.font.class, nearest: l.font.nearest, size_pct_w: Number(l.font.size_pct_w) || undefined, case: l.font.case, tracking: l.font.tracking, leading: Number(l.font.leading) || undefined, align: l.font.align } : undefined,
    colour: /^#[0-9a-f]{6}$/i.test(l?.colour) ? l.colour : undefined, blend: l?.blend ? String(l.blend) : undefined,
    bleeds: Array.isArray(l?.bleeds) ? l.bleeds.map(String).slice(0, 4) : undefined, notes: l?.notes ? String(l.notes).slice(0, 200) : undefined,
  }));
  const m = ref.meta;
  return { ref: ref.name || 'reference', size: m?.w && m?.h ? [m.w, m.h] : null, palette: m?.palette ?? [], ground: /^#[0-9a-f]{6}$/i.test(j?.ground) ? j.ground : (m?.palette?.[0] ?? ''), layers, laws: (Array.isArray(j?.laws) ? j.laws : []).map(String).slice(0, 12) };
}

// the breakdown in the canvas's own pixels, for the writer
export function breakdownFor(b: Breakdown, size: [number, number]): string {
  const [W, H] = size, px = (v: number, of: number) => Math.round((v / 100) * of);
  return [
    `Reference "${b.ref}"${b.size ? ` (${b.size[0]} by ${b.size[1]})` : ''}: ground ${b.ground}${b.palette.length ? `; measured palette ${b.palette.join(' ')}` : ''}.`,
    'Layers, back to front, in this canvas\'s pixels (x, y is the top-left corner):',
    ...b.layers.map((l) => {
      const [x, y, w, h] = l.box, f = l.font;
      return `- ${l.role || l.kind} (${l.kind}): x ${px(x, W)}, y ${px(y, H)}, ${px(w, W)} by ${px(h, H)}${l.colour ? `, ${l.colour}` : ''}${l.blend && l.blend !== 'normal' ? `, ${l.blend}` : ''}`
        + (f ? `; ${f.nearest || f.class || ''}${f.size_pct_w ? ` size ${Math.round((f.size_pct_w / 100) * W)}` : ''}${f.case ? `, ${f.case}` : ''}${f.tracking ? `, ${f.tracking} tracking` : ''}${f.leading ? `, line step ${f.leading}` : ''}${f.align ? `, aligned ${f.align}` : ''}` : '')
        + (l.bleeds?.length ? `; bleeds off ${l.bleeds.join(', ')}` : '') + (l.text ? `; reads "${l.text}" (do not copy)` : '') + (l.notes ? `; ${l.notes}` : '');
    }),
    b.laws.length ? 'Laws:\n' + b.laws.map((x) => '- ' + x).join('\n') : '',
  ].filter(Boolean).join('\n');
}

// the canvas takes the reference's shape unless the brief names a size or a format
export function sizeFromRefs(prompt: string, refs: Img[]): [number, number] | null {
  if (/\b\d{3,4}\s*(x|by|×)\s*\d{3,4}\b|\b(story|stories|reel|landscape|banner|square|header|thumbnail|a4|a3|letter|business card|16:9|9:16|4:5|1:1|2:3)\b/i.test(prompt)) return null;
  const m = refs.find((r) => r.meta?.w && r.meta?.h)?.meta;
  if (!m) return null;
  const ratio = Math.max(0.45, Math.min(2.4, m.h! / m.w!));
  return ratio >= 1 ? [1080, Math.round(1080 * ratio)] : [Math.round(1080 / ratio), 1080];
}

export function planWizard(models: Models, fonts: string[]) {
  const w = wizardOf(models);
  w.addComputeStep({
    id: 'look',
    handler: async ({ state, setState }) => {
      const b: Brief = { ...state.brief, looksLike: state.brief.looksLike ?? [] };
      const all = [...b.images, ...b.looksLike];
      if (!all.length) return w.signal.skip;
      const t0 = Date.now();
      const looks = await models.read({
        prompt: [
          `A designer was given these images for this brief: "${b.prompt}".`,
          b.images.length ? `Images the piece will print, in order: ${b.images.map((i) => '@' + i.name).join(', ')}.` : '',
          b.looksLike.length ? `Style references (the piece must not print them, only match their look), in order: ${b.looksLike.map((i) => i.name).join(', ')}.` : '',
          'The images follow in that order: printed images first, then style references.',
          'For each printed image say, in two or three lines: what it shows, its main colours as hex, its light and mood, where the subject sits (so text can avoid it), and how it could be used in the piece.',
          'For each style reference say, in two or three lines: its layout and composition, type (weight, case, size against the page), colours as hex, materials and finish, and the mood, as instructions a designer could follow.',
        ].filter(Boolean).join('\n'),
        images: all, maxTokens: 1200,
      });
      setState((s: any) => ({ ...s, looks, trail: stamp(s, 'look', 'reader', t0, `looked at ${all.length} image${all.length > 1 ? 's' : ''}`) }));
      return w.signal.skip;
    },
  });
  w.addComputeStep({
    id: 'study',
    handler: async ({ state, setState }) => {
      const refs: Img[] = (state.brief.looksLike ?? []).slice(0, 3);
      if (!refs.length) return w.signal.skip;
      const t0 = Date.now();
      const breakdowns: Breakdown[] = [];
      for (const ref of refs) {
        const m = ref.meta;
        const reply = await models.read({
          prompt: [
            'Take this design apart, layer by layer, so another designer can rebuild its structure exactly with different words and pictures.',
            m?.w && m?.h ? `Measured: it is ${m.w} by ${m.h} pixels.` : '',
            m?.palette?.length ? `Measured palette, most used first: ${m.palette.join(' ')}. Use these hex values.` : '',
            `Fonts available for "nearest": ${fonts.join(', ')}.`,
            'Measure carefully: boxes are percentages of the width and height; font size is the height of a capital letter divided by 0.7, as a percentage of the width.',
            `Reply with JSON only:\n${BREAKDOWN_SHAPE}`,
          ].filter(Boolean).join('\n\n'),
          images: [ref], maxTokens: 2500,
        });
        breakdowns.push(tidyBreakdown(extractJson(reply) || {}, ref));
      }
      setState((s: any) => ({ ...s, breakdowns, trail: stamp(s, 'study', 'reader', t0, breakdowns.map((b) => `${b.ref}: ${b.layers.length} layers, ${b.laws.length} laws`).join('; ')) }));
      return w.signal.skip;
    },
  });
  w.addObjectStep({
    id: 'plan', model: 'reader', maxTokens: 1500,
    instruction: [
      'You plan a piece for Studio Morgana, a studio that writes designs in godtongue (plain English that compiles to a picture).',
      'Brief: "{{prompt}}"', '{{looks}}', '{{refs}}',
      '{{dockets}}',
      `Fonts you may use: ${fonts.join(', ')}.`,
      'Break the brief down into a plan the writer can follow. Prefer a flat canvas for posters, posts, brand pages and UI; a card for collectibles; a video when the brief asks for motion.',
      `Reply with JSON of this shape:\n${PLAN_SHAPE}`,
    ].join('\n\n'),
    context: (s) => ({
      prompt: s.brief.prompt,
      looks: s.looks ? 'What the images show (style references are to be matched, not printed):\n' + s.looks : '',
      dockets: s.brief.dockets?.length ? `The person chose these looks: ${s.brief.dockets.join(', ')}. Use them.` : DOCKETS.length ? `Looks we make well, each written up with a finished example (choose the ones that fit; follow their grid, type and palette):\n${docketIndex()}` : '',
      refs: s.brief.refs.length ? 'Reference pieces to match in style (godtongue sources, shortened):\n' + s.brief.refs.map((r: string) => r.slice(0, 1500)).join('\n---\n') : '',
    }),
    handler: ({ json, setState }) => {
      setState((s: any) => ({ ...s, plan: tidyPlan(json, s.brief), trail: stamp(s, 'plan', 'reader', s._t ?? Date.now(), json ? `a ${json.kind || 'canvas'} with ${(json.elements || []).length} elements` : 'no plan; writing from the brief') }));
      return w.signal.skip;
    },
  });
  w.addObjectStep({
    id: 'manual', model: 'reader', maxTokens: 500,
    instruction: [
      'The writer will write this plan in godtongue. Pick the chapters of the godtongue manual it needs: the verbs it will use, the word lists, and one or two examples closest to this piece. The core chapters are always included.',
      'Plan:\n{{plan}}',
      'Chapters:\n{{contents}}',
      'Reply with JSON: { "chapters": ["id", …] } with 4 to 10 ids from the list.',
    ].join('\n\n'),
    context: (s) => ({ plan: JSON.stringify(s.plan), contents: contents() }),
    handler: ({ json, setState }) => {
      setState((s: any) => {
        const chapters = chaptersFor(json?.chapters, { kind: s.plan.kind });
        return { ...s, chapters, trail: stamp(s, 'manual', 'reader', Date.now(), chapters.map((c: Chapter) => c.id).join(', ')) };
      });
      return w.signal.skip;
    },
  });
  return w;
}

export async function planBrief(models: Models, brief: Brief, fonts: string[]): Promise<Planned> {
  const out = await runToEnd(planWizard(models, fonts), { brief, trail: [] as Step[] } as any);
  const plan: Plan = out.plan ?? tidyPlan({}, brief);
  return { plan, chapters: out.chapters ?? chaptersFor([], { kind: plan.kind }), looks: out.looks || '', trail: out.trail, dockets: docketsOf(plan.dockets), breakdowns: out.breakdowns ?? [] };
}

export const docketsOf = (ids: string[]) => ids.map((id) => DOCKETS.find((d) => d.id === id)).filter((d): d is Docket => !!d);

// a plan the writer can rely on, whatever the reader sent
export function tidyPlan(j: any, b: Brief): Plan {
  const kinds = ['canvas', 'card', 'stage', 'video'];
  const p: Plan = {
    kind: kinds.includes(j?.kind) ? j.kind : 'canvas',
    title: String(j?.title || b.prompt.split(/\s+/).slice(0, 3).join('-')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'piece-$1').slice(0, 40) || 'piece',
    size: Array.isArray(j?.size) && j.size.length === 2 && j.size.every((n: unknown) => Number(n) > 50 && Number(n) < 5000) ? [Number(j.size[0]), Number(j.size[1])] : undefined,
    flat: j?.flat !== false, seconds: Number(j?.seconds) > 0 ? Math.min(30, Number(j.seconds)) : undefined,
    mood: String(j?.mood || ''), notes: String(j?.notes || ''),
    palette: (Array.isArray(j?.palette) ? j.palette : []).filter((c: any) => /^#[0-9a-f]{6}$/i.test(c?.hex)).slice(0, 8).map((c: any) => ({ name: String(c.name || 'colour').toLowerCase().replace(/[^a-z-]+/g, '-'), hex: c.hex })),
    fonts: (Array.isArray(j?.fonts) ? j.fonts : []).map(String).slice(0, 3),
    elements: (Array.isArray(j?.elements) ? j.elements : []).slice(0, 40).map((e: any) => ({ name: String(e?.name || ''), what: String(e?.what || ''), where: String(e?.where || '') })),
    images: (Array.isArray(j?.images) ? j.images : []).filter((x: any) => b.images.some((i) => i.name === x?.file)).map((x: any) => ({ file: x.file, use: String(x.use || '') })),
    dockets: (b.dockets?.length ? b.dockets : Array.isArray(j?.dockets) ? j.dockets : []).map(String).filter((id: string) => DOCKETS.some((d) => d.id === id)).slice(0, 2),
    slots: Object.fromEntries(Object.entries(j?.slots && typeof j.slots === 'object' ? j.slots : {}).slice(0, 20).map(([k, v]) => [String(k), String(v)])),
    missing: (Array.isArray(j?.missing) ? j.missing : []).map(String).slice(0, 8),
  };
  const fromRef = sizeFromRefs(b.prompt, b.looksLike ?? []);
  if (fromRef && p.kind !== 'card') p.size = fromRef;                 // the reference's shape, measured
  if (p.kind === 'card') { p.size = undefined; p.flat = false; }
  if (!p.size && p.kind !== 'card') p.size = [1080, 1350];
  return p;
}

const DIRECTIONS = [
  'the most direct reading of the plan',
  'a bolder take: stronger contrast, bigger type, one daring move',
  'a quiet, minimal take with one precious detail',
  'an ornate, collectible take',
  'a graphic, typographic take',
  'a different composition: move the focal point, change the scale',
];

export interface Written { source: string; ok: boolean; checked: GtChecked; rounds: number; trail: Step[] }

export async function writeOption(models: Models, o: { brief: Brief; planned: Planned; files: Record<string, Uint8Array>; i: number; n: number; rounds: number; stamps?: LibStamp[] }): Promise<Written> {
  const { brief, planned } = o;
  // each option builds on one chosen look; with two looks the options alternate between them
  const printable = brief.assets ?? brief.images.map((i) => ({ name: i.name!, type: i.mime, label: i.meta?.label ?? null, w: i.meta?.w ?? null, h: i.meta?.h ?? null, palette: i.meta?.palette ?? [] }));
  const breakdowns = planned.breakdowns ?? [], size = (planned.plan.size ?? [1240, 1829]) as [number, number];
  const picks = planned.dockets ?? [], slots = planned.plan.slots ?? {}, missing = planned.plan.missing ?? [];
  const docket = picks.length ? picks[o.i % picks.length] : null;
  const system = systemFor(planned.chapters) + '\n\n' + HOUSE + (docket ? `\n\n# The look for this piece: ${docket.name}\nThis is one of our dockets: a look we make well, written down with a finished example. Build the piece on it: its grid, type, palette, signature and don'ts are the rules; its slots are what the brief changes. Do not copy the example's words or images; use the brief's.\n\n${docket.text}\n\n## Our example of this look\n\`\`\`gt\n${docket.source.trim()}\n\`\`\`` : '');
  const request = () => [
    `Brief: "${brief.prompt}"`,
    'Plan (from a designer who read the brief and looked at the images):', '```json', JSON.stringify(planned.plan, null, 1), '```',
    planned.looks ? 'What the images show:\n' + planned.looks : '',
    printable.length ? `Assets you may print (and only these):\n${printable.map((a) => `- @${a.name}${a.label ? ` (${a.label})` : ''}${a.w && a.h ? `, ${a.w} by ${a.h}` : ''}${a.palette.length ? `, colours ${a.palette.slice(0, 4).join(' ')}` : ''}`).join('\n')}` : 'You were given no assets: print no images.',
    (brief.looksLike ?? []).length ? 'The style references are for their look only: never print them, and do not copy their words.' : '',
    breakdowns.length ? `How the reference is built (rebuild this structure: the same proportions, layer order, type sizes and laws, with the brief's own words and assets; where a reference layer is a photo or illustration and the brief gives no asset for it, use shapes in its colours instead):\n${breakdowns.map((b) => breakdownFor(b, size)).join('\n\n')}` : '',
    stampList(o.stamps ?? []),
    docket && Object.keys(slots).length ? `What the brief gives for the look's slots:\n${Object.entries(slots).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : '',
    docket && missing.length ? `The brief does not say: ${missing.join('; ')}. Choose something fitting and plausible for each; never leave a placeholder.` : '',
    o.n > 1 ? (docket ? `This is option ${o.i + 1} of ${o.n} on the look "${docket.name}": keep its structure and vary within its slots (${['the first of its palettes', 'another of its palettes', 'another arrangement of its slots', 'its inverted or darkest palette'][Math.floor(o.i / Math.max(1, picks.length)) % 4]}).` : `This is option ${o.i + 1} of ${o.n}: ${DIRECTIONS[o.i % DIRECTIONS.length]}.`) : '',
  ].filter(Boolean).join('\n\n');
  const w = wizardOf(models);
  w.addComputeStep({
    id: 'write',
    handler: async ({ state, setState }) => {
      const t0 = Date.now();
      const reply = await models.write({
        system, prompt: request() + '\n\nWrite the piece in the plain-English style ("Let there be …"), placing things with words where you can. Reply with one godtongue piece in a single ```gt block and nothing else.',
        temperature: 0.7,
      });
      const raw = codeOf(reply);
      const source = raw ? withStamps(raw, o.stamps ?? []) : '';
      if (!source) {
        if ((state.tries ?? 0) >= 1) return w.signal.fail('the writer did not write a godtongue piece');
        setState((s: any) => ({ ...s, tries: (s.tries ?? 0) + 1, trail: stamp(s, 'write', 'writer', t0, 'the reply had no source in it; asking again') }));
        return w.signal.retry();
      }
      setState((s: any) => ({ ...s, source, trail: stamp(s, 'write', 'writer', t0, `${source.split('\n').length} lines`) }));
      return w.signal.skip;
    },
  });
  addCheckLoop(w, models, request);
  const out = await runToEnd<LoopState>(w, { source: '', system, files: o.files, rounds: o.rounds, round: 0, trail: [] });
  return { source: out.source, ok: !!out.checked?.ok, checked: out.checked!, rounds: out.round ?? 0, trail: out.trail };
}

export { errorsOf, extractJson };
