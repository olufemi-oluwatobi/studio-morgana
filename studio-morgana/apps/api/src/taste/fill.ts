// The taste book's pure side: its shapes, how a template is filled, and how the model's answers are checked.
// No model and no compiler here, so the build can use it to check every template, and tests can run it alone.
//
//   pick  (step 1, the model chooses)  → tidyPicks:    real ids, allowed combinations, options that differ
//   spec  (step 2, the model fills)    → tidySpec:     every line there and short enough, sizes from the scale, art allowed
//   script (step 3, code writes)       → fillTemplate: the template's {{holes}} filled; godtongue out

export type RoleName = 'ground' | 'ink' | 'accent' | 'second';
export const ROLES: RoleName[] = ['ground', 'ink', 'accent', 'second'];
export interface Role { hex: string; share: number; use: string }
export interface Palette { id: string; name: string; description: string; tags: string[]; roles: Record<RoleName, Role>; rules: string[] }
export interface Face { font: string; weight: number; tracking: number; leading: number; case: string }
export interface TypeSystem { id: string; name: string; description: string; tags: string[]; display: Face; label: Face; scale: number[] }
export interface Spacing { id: string; name: string; description: string; margin: number }
export interface SizeSpec { role: 'display' | 'label'; default: number; max: number; width: number | 'margins' | 'safe'; elements: string[]; description: string }
export interface Safe { top: number; bottom: number; left: number; right: number }
export interface Format { id: string; name: string; size: [number, number]; ratio: string; words: string[]; safe: Safe; description: string }
export interface Slot { name: string; lines: number; max: number; description: string; default: string[] }
export interface Art { description: string; shapes: string; stamp: string; asset: string; stampInk: RoleName }
export interface Template {
  id: string; name: string; description: string; use: string; tags: string[]; guide: string; size: [number, number];
  formats: string[];                                 // the formats it is made for
  flexible?: boolean;                                // its positions are sums of W, H and the safe area: code fills it at any format's size
  fits: { type: string[]; spacing: string[] }; sizes: Record<string, SizeSpec>; slots: Slot[]; art: Art; source: string;
}
export interface Book { palettes: Palette[]; type: TypeSystem[]; spacing: Spacing[]; templates: Template[]; formats: Format[] }

export interface Pick { option: number; template: string; palette: string; type: string; spacing: string; why: string; mode: 'rewrite' | 'new' }
export interface Spec {
  texts: Record<string, string[]>;
  sizes: Record<string, number>;
  art: { use: 'shapes' | 'stamp' | 'asset'; stamp?: string; asset?: string };
  tweaks: string[];                                  // what the person asked that the slots do not cover; the writer applies them
  why: string;
}
export interface Chosen { template: Template; palette: Palette; type: TypeSystem; spacing: Spacing; format?: Format }

export const chosenOf = (book: Book, p: Pick, format?: Format): Chosen => ({
  template: book.templates.find((t) => t.id === p.template)!,
  palette: book.palettes.find((x) => x.id === p.palette)!,
  type: book.type.find((x) => x.id === p.type)!,
  spacing: book.spacing.find((x) => x.id === p.spacing)!,
  format,
});

// the canvas code fills: a flexible template takes the format's size and safe area; a fixed one keeps its own
// size (the writer moves it to the format). The margin is a share of the shorter side.
export function canvasOf(c: Chosen): { W: number; H: number; margin: number; safe: Safe; native: boolean } {
  const fits = !!c.format && (c.template.flexible || (c.format.size[0] === c.template.size[0] && c.format.size[1] === c.template.size[1]));
  const [W, H] = fits ? c.format!.size : c.template.size;
  const safe = fits ? c.format!.safe : { top: 0, bottom: 0, left: 0, right: 0 };
  return { W, H, margin: Math.round(Math.min(W, H) * c.spacing.margin), safe, native: !c.format || fits };
}

// ── sums in the holes: numbers, names, + - * / and brackets; nothing else runs ────────────────────────────────────
export function evalExpr(expr: string, vars: Record<string, number>): number {
  const toks = expr.match(/\d+(?:\.\d+)?|[A-Za-z_][\w.]*|[-+*/()]/g) ?? [];
  if (toks.join('') !== expr.replace(/\s+/g, '')) throw new Error(`cannot read "${expr}"`);
  let i = 0;
  const atom = (): number => {
    const t = toks[i++];
    if (t === undefined) throw new Error(`"${expr}" ends too soon`);
    if (t === '(') { const v = sum(); if (toks[i++] !== ')') throw new Error(`a bracket is not closed in "${expr}"`); return v; }
    if (t === '-') return -atom();
    if (/^\d/.test(t)) return Number(t);
    if (!(t in vars)) throw new Error(`no value called ${t}`);
    return vars[t];
  };
  const product = (): number => { let v = atom(); while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++]; const r = atom(); v = op === '*' ? v * r : v / r; } return v; };
  const sum = (): number => { let v = product(); while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++]; const r = product(); v = op === '+' ? v + r : v - r; } return v; };
  const v = sum();
  if (i !== toks.length) throw new Error(`cannot read "${expr}"`);
  return v;
}

const round1 = (v: number) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? 0 : r; };

// the width a size may run to, in pixels
export function widthOf(s: SizeSpec, W: number, margin: number, safe: Safe = { top: 0, bottom: 0, left: 0, right: 0 }): number {
  return s.width === 'margins' ? W - 2 * margin
    : s.width === 'safe' ? W - Math.max(margin, safe.left) - Math.max(margin, safe.right)
    : s.width <= 1 ? s.width * W : s.width;
}

// which face a text slot is set in (by the size whose elements are that slot's lines)
export function faceOfSlot(t: Template, type: TypeSystem, slot: string): Face {
  const s = Object.values(t.sizes).find((z) => z.elements.some((e) => e.startsWith(slot + '-')));
  return s?.role === 'label' ? type.label : type.display;
}

// ── step 3: the template, filled ──────────────────────────────────────────────────────────────────────────────────
export function fillTemplate(c: Chosen, spec: Spec): string {
  const { template: t, palette: p, type: ty } = c;
  const { W, H, margin, safe } = canvasOf(c);
  const words: Record<string, string> = {};
  for (const r of ROLES) words[`c.${r}`] = p.roles[r].hex;
  for (const f of ['display', 'label'] as const) { words[`font.${f}`] = ty[f].font; words[`weight.${f}`] = String(ty[f].weight); }
  const nums: Record<string, number> = {
    W, H, margin, 'lead.display': ty.display.leading, 'lead.label': ty.label.leading,
    'safe.top': safe.top, 'safe.bottom': safe.bottom, 'safe.left': safe.left, 'safe.right': safe.right,
    // the inner edges: the margin or the safe area, whichever is further in
    left: Math.max(margin, safe.left), right: W - Math.max(margin, safe.right), top: Math.max(margin, safe.top), bottom: H - Math.max(margin, safe.bottom),
  };
  for (const [k, s] of Object.entries(t.sizes)) {
    const size = spec.sizes[k] ?? s.default;
    nums[`size.${k}`] = size;
    nums[`track.${k}`] = round1(size * ty[s.role].tracking);
  }
  const art = spec.art.use === 'stamp' && spec.art.stamp ? t.art.stamp.replaceAll('{{stamp}}', spec.art.stamp)
    : spec.art.use === 'asset' && spec.art.asset ? t.art.asset.replaceAll('{{asset}}', spec.art.asset)
    : t.art.shapes;
  return t.source.replace('{{art}}', art).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const line = key.match(/^([a-z][a-z0-9-]*)\.(\d+)$/);
    if (line && t.slots.some((s) => s.name === line[1])) {
      const face = faceOfSlot(t, ty, line[1]);
      const text = (spec.texts[line[1]]?.[Number(line[2]) - 1] ?? '').replace(/["\n\r]/g, '').trim();
      return face.case === 'upper' ? text.toUpperCase() : text;
    }
    if (key in words) return words[key];
    return String(round1(evalExpr(key, nums)));
  });
}

// ── step 1: the picks, made safe ─────────────────────────────────────────────────────────────────────────────────
// Unknown ids are replaced, a type or spacing the template does not take is swapped for one it does, and options
// that came out the same are moved to another palette. Whatever the model sent, n usable picks come back.
// offered: what the model was shown (the filtered book); fallbacks come from it, while any real id in the book is accepted
export function tidyPicks(raw: unknown, book: Book, n: number, offered: Book = book): { picks: Pick[]; notes: string[] } {
  const notes: string[] = [];
  const list = Array.isArray((raw as any)?.picks) ? (raw as any).picks : Array.isArray(raw) ? raw : [];
  const picks: Pick[] = [];
  for (let i = 0; i < n; i++) {
    const r = list[i] ?? list[i % Math.max(1, list.length)] ?? {};
    let t = book.templates.find((x) => x.id === r.template);
    if (!t) { t = offered.templates[i % offered.templates.length]; notes.push(`option ${i + 1}: template "${r.template ?? ''}" is not in the book; used ${t.id}`); }
    let pal = book.palettes.find((x) => x.id === r.palette);
    if (!pal) { pal = offered.palettes[(i * 3) % offered.palettes.length]; notes.push(`option ${i + 1}: palette "${r.palette ?? ''}" is not in the book; used ${pal.id}`); }
    let ty = r.type, spc = r.spacing;
    if (!t.fits.type.includes(ty)) { if (ty) notes.push(`option ${i + 1}: ${t.id} does not take type "${ty}"; used ${t.fits.type[0]}`); ty = t.fits.type[0]; }
    if (!t.fits.spacing.includes(spc)) { if (spc) notes.push(`option ${i + 1}: ${t.id} does not take spacing "${spc}"; used ${t.fits.spacing[0]}`); spc = t.fits.spacing[0]; }
    const mode: Pick['mode'] = String(r.mode ?? '').toLowerCase().startsWith('new') ? 'new' : 'rewrite';
    picks.push({ option: i + 1, template: t.id, palette: pal.id, type: ty, spacing: spc, why: String(r.why ?? '').slice(0, 300), mode });
  }
  // options must differ: the same template, palette and type twice gets the next palette
  for (let i = 1; i < picks.length; i++) {
    const same = (a: Pick, b: Pick) => a.template === b.template && a.palette === b.palette && a.type === b.type;
    for (let tries = 0; picks.slice(0, i).some((q) => same(q, picks[i])) && tries < book.palettes.length; tries++) {
      const k = book.palettes.findIndex((x) => x.id === picks[i].palette);
      picks[i] = { ...picks[i], palette: book.palettes[(k + 1) % book.palettes.length].id };
      if (tries === 0) notes.push(`option ${i + 1} was the same as an earlier one; moved to ${picks[i].palette}`);
    }
  }
  return { picks, notes };
}

// ── step 2: the spec, checked ────────────────────────────────────────────────────────────────────────────────────
// errors: what the model must fix (said back to it once). spec: usable whatever it sent — lines that are missing
// take the template's defaults, lines that are too long are cut at a word, sizes snap to the scale.
export function tidySpec(raw: unknown, c: Chosen, allowed: { stamps: string[]; assets: string[] }): { spec: Spec; errors: string[] } {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const { template: t, type: ty } = c;
  const errors: string[] = [];
  const texts: Record<string, string[]> = {};
  for (const s of t.slots) {
    const got = Array.isArray(r.texts?.[s.name]) ? r.texts[s.name].map((x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim()) : null;
    if (!got) { errors.push(`texts.${s.name} is missing: it needs ${s.lines} line${s.lines > 1 ? 's' : ''}`); texts[s.name] = [...s.default]; continue; }
    if (got.length !== s.lines) errors.push(`texts.${s.name} has ${got.length} line${got.length === 1 ? '' : 's'}; it needs exactly ${s.lines}`);
    texts[s.name] = Array.from({ length: s.lines }, (_, k) => {
      const line = got[k] ?? '';
      if (!line) { if (k < got.length) errors.push(`texts.${s.name} line ${k + 1} is empty`); return s.default[k] ?? ''; }
      if ([...line].length > s.max) {
        errors.push(`texts.${s.name} line ${k + 1} "${line}" has ${[...line].length} characters; at most ${s.max}`);
        return cutAt(line, s.max);
      }
      return line;
    });
  }
  const sizes: Record<string, number> = {};
  for (const [k, s] of Object.entries(t.sizes)) {
    const allowedSizes = ty.scale.filter((v) => v <= s.max);
    const want = Number(r.sizes?.[k]);
    if (!Number.isFinite(want) || want <= 0) { sizes[k] = s.default <= s.max ? nearest(allowedSizes.length ? allowedSizes : [s.max], s.default) : s.max; continue; }
    sizes[k] = nearest(allowedSizes.length ? allowedSizes : [s.max], Math.min(want, s.max));
  }
  let art: Spec['art'] = { use: 'shapes' };
  const use = r.art?.use;
  if (use === 'stamp') {
    if (allowed.stamps.includes(r.art.stamp)) art = { use: 'stamp', stamp: r.art.stamp };
    else errors.push(`art.stamp "${r.art?.stamp ?? ''}" is not one of the stamps offered`);
  } else if (use === 'asset') {
    const a = String(r.art?.asset ?? '').replace(/^@/, '');
    if (allowed.assets.includes(a)) art = { use: 'asset', asset: a };
    else errors.push(`art.asset "${a}" is not one of the uploaded files`);
  } else if (use !== undefined && use !== 'shapes') errors.push(`art.use must be "shapes", "stamp" or "asset"`);
  const tweaks = (Array.isArray(r.tweaks) ? r.tweaks : []).map((x: unknown) => String(x ?? '').trim()).filter((x: string) => x && !/^(none|nothing|n\/a|-)\.?$/i.test(x)).slice(0, 8);
  return { spec: { texts, sizes, art, tweaks, why: String(r.why ?? '').slice(0, 300) }, errors };
}

const nearest = (list: number[], v: number) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), list[0]);
function cutAt(line: string, max: number): string {
  const words = line.split(' ');
  let out = '';
  for (const w of words) { const next = out ? out + ' ' + w : w; if ([...next].length > max) break; out = next; }
  return out || [...line].slice(0, max).join('');
}

// the defaults: the template as we designed it (the build checks these, and a failed spec falls back to them)
export function defaultSpec(t: Template): Spec {
  return {
    texts: Object.fromEntries(t.slots.map((s) => [s.name, [...s.default]])),
    sizes: Object.fromEntries(Object.entries(t.sizes).map(([k, s]) => [k, s.default])),
    art: { use: 'shapes' }, tweaks: [], why: 'the template as designed',
  };
}

// ── what the model reads ─────────────────────────────────────────────────────────────────────────────────────────
// The whole book, every entry with its description, for step 1.
export function bookText(book: Book): string {
  const tpl = book.templates.map((t) => [
    `- ${t.id}: ${t.name}, ${t.size[0]} by ${t.size[1]}.`,
    `  ${t.description}`,
    `  Use for: ${t.use}. Tags: ${t.tags.join(', ')}.`,
    `  Slots: ${t.slots.map((s) => `${s.name} (${s.lines} line${s.lines > 1 ? 's' : ''}, ≤${s.max} characters: ${s.description})`).join('; ')}.`,
    `  Takes type systems: ${t.fits.type.join(', ')}. Takes spacing: ${t.fits.spacing.join(', ')}.`,
  ].join('\n')).join('\n');
  const pal = book.palettes.map((p) => [
    `- ${p.id}: ${p.name}. ${p.description}`,
    `  Tags: ${p.tags.join(', ')}.`,
    `  ${ROLES.map((r) => `${r} ${p.roles[r].hex} (${Math.round(p.roles[r].share * 100)}%, ${p.roles[r].use})`).join('; ')}.`,
    p.rules.length ? `  Rules: ${p.rules.join('; ')}.` : '',
  ].filter(Boolean).join('\n')).join('\n');
  const typ = book.type.map((s) => [
    `- ${s.id}: ${s.name}. ${s.description}`,
    `  Tags: ${s.tags.join(', ')}. Display: ${s.display.font} ${s.display.weight}${s.display.case === 'upper' ? ', capitals' : ''}. Labels: ${s.label.font} ${s.label.weight}, capitals.`,
  ].join('\n')).join('\n');
  const spc = book.spacing.map((s) => `- ${s.id}: ${s.name}. ${s.description}`).join('\n');
  return `## Templates (our designs)\n${tpl}\n\n## Palettes\n${pal}\n\n## Type systems\n${typ}\n\n## Spacing systems\n${spc}`;
}

// One option's chosen entries in full, for step 2.
export function choiceText(c: Chosen, guide: string): string {
  const { template: t, palette: p, type: ty, spacing: sp } = c;
  const { W, margin, safe } = canvasOf(c);
  return [
    `## Template: ${t.name} (${t.id}), ${t.size[0]} by ${t.size[1]}`,
    t.description,
    guide ? `How we designed it (our notes; the example's words are not yours to reuse):\n${guide}` : '',
    `## Slots to fill (every line; count the characters)`,
    ...t.slots.map((s) => `- ${s.name}: exactly ${s.lines} line${s.lines > 1 ? 's' : ''}, each at most ${s.max} characters${faceOfSlot(t, ty, s.name).case === 'upper' ? ' (set in capitals by the type system)' : ''}. ${s.description}. Our example: ${JSON.stringify(s.default)}`),
    `## Sizes (choose from the scale; code shrinks a size until its lines fit)`,
    ...Object.entries(t.sizes).map(([k, s]) => {
      const face = ty[s.role], scale = ty.scale.filter((v) => v <= s.max);
      return `- ${k}: ${face.font} ${face.weight}; choose from ${JSON.stringify(scale)} (designed at ${s.default}); its lines may run ${Math.round(widthOf(s, W, margin, safe))} pixels wide. ${s.description}`;
    }),
    `## Palette: ${p.name} (fixed: the template already places each role)`,
    ...ROLES.map((r) => `- ${r}: ${p.roles[r].hex}, ${p.roles[r].use}`),
    p.rules.length ? `Rules: ${p.rules.join('; ')}` : '',
    `## Type system: ${ty.name}. ${ty.description}`,
    `## Spacing: ${sp.name}. ${sp.description}`,
    `## Art: ${t.art.description}`,
  ].filter(Boolean).join('\n');
}

// ── formats and filters ──────────────────────────────────────────────────────────────────────────────────────────
// The format the brief names ("for TikTok", "a YouTube thumbnail"), by its words; the longest match wins, so
// "instagram story" beats "instagram".
export function detectFormat(text: string, formats: Format[]): Format | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9:]+/g, ' ')} `;
  let best: { f: Format; len: number } | undefined;
  for (const f of formats) for (const w of f.words) {
    if (t.includes(` ${w.toLowerCase()} `) && (!best || w.length > best.len)) best = { f, len: w.length };
  }
  return best?.f;
}

export interface Filters { format?: Format; tags?: string[]; brief?: string }
export const FILTER_CAPS = { templates: 8, palettes: 12, type: 8 };

// The book cut to what fits: templates made for the format (all of them if none is), palettes and type systems
// ranked by the person's filter tags, then by the brief's words, and capped. Small books pass through whole.
export function filterBook(book: Book, f: Filters, caps = FILTER_CAPS): { book: Book; notes: string[] } {
  const notes: string[] = [];
  const want = new Set((f.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean));
  const words = new Set((f.brief ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  // a filter tag counts 4, a brief word among the tags 2, a brief word in the name or description 1
  const score = (x: { id: string; name: string; tags: string[]; description?: string }) => {
    const prose = new Set(`${x.name} ${x.description ?? ''}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
    let s = 0;
    for (const t of x.tags) { if (want.has(t)) s += 4; if (words.has(t)) s += 2; }
    for (const w of prose) if (words.has(w)) s += 1;
    return s;
  };
  const rank = <T extends { id: string; name: string; tags: string[]; description?: string }>(list: T[], cap: number, what: string): T[] => {
    let pool = list;
    if (want.size) {
      const hit = list.filter((x) => x.tags.some((t) => want.has(t)));
      if (hit.length >= 2) { pool = hit; notes.push(`${what}: ${hit.length} of ${list.length} carry the filter tags`); }
    }
    const ranked = pool.map((x, i) => ({ x, s: score(x), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((r) => r.x);
    if (ranked.length > cap) notes.push(`${what}: the ${cap} that best fit the brief, of ${ranked.length}`);
    return ranked.slice(0, cap);
  };
  let templates = book.templates;
  if (f.format) {
    const made = book.templates.filter((t) => t.formats.includes(f.format!.id));
    if (made.length) { templates = made; notes.push(`templates: ${made.length} made for ${f.format.name}`); }
    else notes.push(`templates: none made for ${f.format.name}; all offered, to be rewritten for it or used as a model for a new one`);
  }
  templates = rank(templates, caps.templates, 'templates');
  // a template's type systems must still be there: keep those it takes, even past the cap
  const palettes = rank(book.palettes, caps.palettes, 'palettes');
  let type = rank(book.type, caps.type, 'type systems');
  for (const t of templates) if (!t.fits.type.some((id) => type.some((x) => x.id === id))) {
    const add = book.type.find((x) => x.id === t.fits.type[0]);
    if (add) type = [...type, add];
  }
  return { book: { ...book, templates, palettes, type, formats: f.format ? [f.format] : book.formats }, notes };
}

// ── the page, checked ────────────────────────────────────────────────────────────────────────────────────────────
// What a piece gets wrong on the page: text off the canvas, text in the app's safe area, text over text.
export interface Laid { ok: boolean; size: [number, number] | null; elements: Record<string, { name: string; box: [number, number, number, number]; text?: string }> }
export function layoutIssues(checked: Laid, f?: Format): string[] {
  if (!checked.ok || !checked.size) return [];
  const [W, H] = checked.size, out: string[] = [];
  const safe = f && f.size[0] === W && f.size[1] === H ? f.safe : { top: 0, bottom: 0, left: 0, right: 0 };
  const texts = Object.values(checked.elements).filter((e) => e.text && e.text.trim());
  for (const e of texts) {
    const [x0, y0, x1, y1] = e.box;
    if (x0 < -2 || y0 < -2 || x1 > W + 2 || y1 > H + 2) out.push(`"${e.name}" runs off the canvas (its box is ${Math.round(x0)}, ${Math.round(y0)} to ${Math.round(x1)}, ${Math.round(y1)}; the canvas is ${W} by ${H})`);
    else if (y0 < safe.top - 2 || y1 > H - safe.bottom + 2 || x0 < safe.left - 2 || x1 > W - safe.right + 2) out.push(`"${e.name}" is outside the safe area (keep text ${safe.top} from the top, ${safe.bottom} from the bottom, ${safe.left} from the left, ${safe.right} from the right)`);
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i].box, b = texts[j].box;
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (w <= 0 || h <= 0) continue;
    const small = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
    if (small > 0 && (w * h) / small > 0.25) out.push(`"${texts[i].name}" and "${texts[j].name}" overlap`);
  }
  return out.slice(0, 10);
}


// One fitting pass: any size whose lines run wider than they may is shrunk in proportion. Code runs it after each
// compile until nothing changes (step 3, and the build's check of every template).
export function fitPass(c: Chosen, spec: Spec, checked: Laid): { spec: Spec; notes: string[]; changed: boolean } {
  const { W, margin, safe } = canvasOf(c);
  const out: Spec = { ...spec, sizes: { ...spec.sizes } }, notes: string[] = [];
  for (const [k, s] of Object.entries(c.template.sizes)) {
    const max = widthOf(s, W, margin, safe);
    const widest = Math.max(0, ...s.elements.map((e) => { const b = checked.elements[e]?.box; return b ? b[2] - b[0] : 0; }));
    if (widest > max + 1) {
      const was = out.sizes[k] ?? s.default, now = Math.max(8, Math.floor(was * (max / widest) * 10) / 10);
      out.sizes[k] = now;
      notes.push(`${k}: ${Math.round(widest)}px wide at size ${was}, allowed ${Math.round(max)}px → size ${now}`);
    }
  }
  return { spec: out, notes, changed: notes.length > 0 };
}
