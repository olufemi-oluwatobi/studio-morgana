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
export interface SizeSpec { role: 'display' | 'label'; default: number; max: number; width: number | 'margins'; elements: string[]; description: string }
export interface Slot { name: string; lines: number; max: number; description: string; default: string[] }
export interface Art { description: string; shapes: string; stamp: string; asset: string; stampInk: RoleName }
export interface Template {
  id: string; name: string; description: string; use: string; tags: string[]; guide: string; size: [number, number];
  fits: { type: string[]; spacing: string[] }; sizes: Record<string, SizeSpec>; slots: Slot[]; art: Art; source: string;
}
export interface Book { palettes: Palette[]; type: TypeSystem[]; spacing: Spacing[]; templates: Template[] }

export interface Pick { option: number; template: string; palette: string; type: string; spacing: string; why: string }
export interface Spec {
  texts: Record<string, string[]>;
  sizes: Record<string, number>;
  art: { use: 'shapes' | 'stamp' | 'asset'; stamp?: string; asset?: string };
  why: string;
}
export interface Chosen { template: Template; palette: Palette; type: TypeSystem; spacing: Spacing }

export const chosenOf = (book: Book, p: Pick): Chosen => ({
  template: book.templates.find((t) => t.id === p.template)!,
  palette: book.palettes.find((x) => x.id === p.palette)!,
  type: book.type.find((x) => x.id === p.type)!,
  spacing: book.spacing.find((x) => x.id === p.spacing)!,
});

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
export function widthOf(s: SizeSpec, W: number, margin: number): number {
  return s.width === 'margins' ? W - 2 * margin : s.width <= 1 ? s.width * W : s.width;
}

// which face a text slot is set in (by the size whose elements are that slot's lines)
export function faceOfSlot(t: Template, type: TypeSystem, slot: string): Face {
  const s = Object.values(t.sizes).find((z) => z.elements.some((e) => e.startsWith(slot + '-')));
  return s?.role === 'label' ? type.label : type.display;
}

// ── step 3: the template, filled ──────────────────────────────────────────────────────────────────────────────────
export function fillTemplate(c: Chosen, spec: Spec): string {
  const { template: t, palette: p, type: ty, spacing: sp } = c;
  const [W, H] = t.size, margin = Math.round(W * sp.margin);
  const words: Record<string, string> = {};
  for (const r of ROLES) words[`c.${r}`] = p.roles[r].hex;
  for (const f of ['display', 'label'] as const) { words[`font.${f}`] = ty[f].font; words[`weight.${f}`] = String(ty[f].weight); }
  const nums: Record<string, number> = { W, H, margin, 'lead.display': ty.display.leading, 'lead.label': ty.label.leading };
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
export function tidyPicks(raw: unknown, book: Book, n: number): { picks: Pick[]; notes: string[] } {
  const notes: string[] = [];
  const list = Array.isArray((raw as any)?.picks) ? (raw as any).picks : Array.isArray(raw) ? raw : [];
  const picks: Pick[] = [];
  for (let i = 0; i < n; i++) {
    const r = list[i] ?? list[i % Math.max(1, list.length)] ?? {};
    let t = book.templates.find((x) => x.id === r.template);
    if (!t) { t = book.templates[i % book.templates.length]; notes.push(`option ${i + 1}: template "${r.template ?? ''}" is not in the book; used ${t.id}`); }
    let pal = book.palettes.find((x) => x.id === r.palette);
    if (!pal) { pal = book.palettes[i % book.palettes.length]; notes.push(`option ${i + 1}: palette "${r.palette ?? ''}" is not in the book; used ${pal.id}`); }
    let ty = r.type, spc = r.spacing;
    if (!t.fits.type.includes(ty)) { if (ty) notes.push(`option ${i + 1}: ${t.id} does not take type "${ty}"; used ${t.fits.type[0]}`); ty = t.fits.type[0]; }
    if (!t.fits.spacing.includes(spc)) { if (spc) notes.push(`option ${i + 1}: ${t.id} does not take spacing "${spc}"; used ${t.fits.spacing[0]}`); spc = t.fits.spacing[0]; }
    picks.push({ option: i + 1, template: t.id, palette: pal.id, type: ty, spacing: spc, why: String(r.why ?? '').slice(0, 300) });
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
  return { spec: { texts, sizes, art, why: String(r.why ?? '').slice(0, 300) }, errors };
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
    art: { use: 'shapes' }, why: 'the template as designed',
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
  const W = t.size[0], margin = Math.round(W * sp.margin);
  return [
    `## Template: ${t.name} (${t.id}), ${t.size[0]} by ${t.size[1]}`,
    t.description,
    guide ? `How we designed it (our notes; the example's words are not yours to reuse):\n${guide}` : '',
    `## Slots to fill (every line; count the characters)`,
    ...t.slots.map((s) => `- ${s.name}: exactly ${s.lines} line${s.lines > 1 ? 's' : ''}, each at most ${s.max} characters${faceOfSlot(t, ty, s.name).case === 'upper' ? ' (set in capitals by the type system)' : ''}. ${s.description}. Our example: ${JSON.stringify(s.default)}`),
    `## Sizes (choose from the scale; code shrinks a size until its lines fit)`,
    ...Object.entries(t.sizes).map(([k, s]) => {
      const face = ty[s.role], scale = ty.scale.filter((v) => v <= s.max);
      return `- ${k}: ${face.font} ${face.weight}; choose from ${JSON.stringify(scale)} (designed at ${s.default}); its lines may run ${Math.round(widthOf(s, W, margin))} pixels wide. ${s.description}`;
    }),
    `## Palette: ${p.name} (fixed: the template already places each role)`,
    ...ROLES.map((r) => `- ${r}: ${p.roles[r].hex}, ${p.roles[r].use}`),
    p.rules.length ? `Rules: ${p.rules.join('; ')}` : '',
    `## Type system: ${ty.name}. ${ty.description}`,
    `## Spacing: ${sp.name}. ${sp.description}`,
    `## Art: ${t.art.description}`,
  ].filter(Boolean).join('\n');
}
