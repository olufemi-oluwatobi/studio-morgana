// Action sheets: what the model writes back instead of JSON. Plain markdown a person can read and a parser can take
// apart: headings make sections, "key: value" lines make fields, "- " lines make items, anything else is text.
//
//   # Option 1                 a section (level 1)
//   template: riso-poster      a field
//   ## headline                a section inside it (level 2)
//   - Good food                an item
//   - better
//
// The parser forgives what models do: bold keys (**template:**), numbered items (1. …), a ```markdown fence around
// the whole reply, extra blank lines and chatter before the first heading.

export interface Section { title: string; level: number; fields: Record<string, string>; items: string[]; text: string; children: Section[] }

const blank = (title: string, level: number): Section => ({ title, level, fields: {}, items: [], text: '', children: [] });
const keyOf = (k: string) => k.toLowerCase().replace(/[*_`]/g, '').trim().replace(/\s+/g, ' ');
const clean = (v: string) => v.replace(/^\*\*|\*\*$/g, '').replace(/^["“]|["”]$/g, '').trim();
const FIELD = /^\**\s*([A-Za-z][\w .'-]{0,30}?)\s*\**\s*:\s*\**\s*(.*)$/;

export function parseSheet(md: string): Section[] {
  // a fence around the whole reply
  const fenced = md.match(/```(?:markdown|md|text)?\s*\n([\s\S]*?)```/);
  const body = fenced && !/^#{1,4}\s/m.test(md.replace(/```[\s\S]*?```/g, '')) ? fenced[1] : md;
  const top: Section[] = [];
  const root = blank('', 0);
  let cur: Section = root;
  let parent: Section | null = null;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (h) {
      const level = h[1].length, title = clean(h[2].replace(/[*_`]/g, ''));
      const s = blank(title, level);
      if (level === 1 || !parent) { top.push(s); parent = s; }
      else parent.children.push(s);
      cur = s;
      continue;
    }
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const text = item ? item[1] : line.trim();
    const f = text.match(FIELD);
    if (f && !/^https?$/i.test(f[1])) {
      const k = keyOf(f[1]);
      if (!(k in cur.fields)) cur.fields[k] = clean(f[2]);
    }
    if (item) cur.items.push(clean(text));
    else if (!f) cur.text += (cur.text ? '\n' : '') + text;
  }
  if (Object.keys(root.fields).length || root.items.length) top.unshift(root);
  return top;
}

// every section, at any depth
export const allSections = (s: Section[]): Section[] => s.flatMap((x) => [x, ...allSections(x.children)]);
export const findSection = (s: Section[], name: string | RegExp): Section | undefined =>
  allSections(s).find((x) => (typeof name === 'string' ? x.title.toLowerCase() === name.toLowerCase() : name.test(x.title)));

// ── the sheets the steps read ────────────────────────────────────────────────────────────────────────────────────

// step 1: "# Format" (optional) and "# Option N" with template, palette, type, spacing, mode, why
export function readPicksSheet(md: string): { format?: string; picks: Record<string, string>[] } {
  const s = parseSheet(md);
  const fmt = findSection(s, /^format$/i)?.fields.format ?? allSections(s).find((x) => x.fields.format)?.fields.format;
  const picks = allSections(s).filter((x) => /^option\s*\d+/i.test(x.title))
    .sort((a, b) => Number(a.title.match(/\d+/)![0]) - Number(b.title.match(/\d+/)![0]))
    .map((x) => ({ ...x.fields, why: x.fields.why ?? x.text }));
  return { format: fmt?.toLowerCase().replace(/\s+/g, '-'), picks };
}

// step 2: one "## <slot>" per slot with its lines as items; "## sizes", "## art", "## tweaks", "## why"
export function readSpecSheet(md: string, slots: string[]): Record<string, unknown> {
  const s = parseSheet(md);
  const texts: Record<string, string[]> = {};
  for (const name of slots) {
    const sec = findSection(s, new RegExp(`^${name.replace(/[-]/g, '[- ]')}$`, 'i'));
    if (!sec) continue;
    const lines = sec.items.length ? sec.items : sec.text.split('\n').filter(Boolean);
    texts[name] = lines.map((l) => l.replace(/^["“]|["”]$/g, '').trim());
  }
  const sizesSec = findSection(s, /^sizes?$/i);
  const sizes: Record<string, number> = {};
  for (const [k, v] of Object.entries(sizesSec?.fields ?? {})) { const n = parseFloat(v); if (Number.isFinite(n)) sizes[k.replace(/\s+/g, '-')] = n; }
  const art = findSection(s, /^art$/i)?.fields ?? {};
  const tw = findSection(s, /^tweaks?$/i);
  const why = findSection(s, /^why$/i);
  return {
    texts, sizes,
    art: { use: (art.use ?? '').toLowerCase().split(/[\s(]/)[0], stamp: art.stamp, asset: art.asset?.replace(/^@/, '') },
    tweaks: tw ? (tw.items.length ? tw.items : tw.text.split('\n').filter(Boolean)) : [],
    why: why ? (why.text || why.items.join(' ')) : '',
  };
}
