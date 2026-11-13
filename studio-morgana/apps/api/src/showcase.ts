// The showcase algorithm: from the public pieces, which ones go on the wall for everyone.
// Pure (no database, no clock of its own), so it can be tested and tuned by itself.
//
//   score = (1 + 3·people who pinned it + 2·people who remixed it) × freshness × 0.5^(age / half-life)
//
// - "people" are other accounts (your own pins and remixes don't count), each counted once
// - freshness: a piece published in the last day counts 1.5×, so new work gets seen before it has any signals
// - half-life: after 10 days a piece counts half, after 20 a quarter, so the wall turns over
// - a tiny tie-break from the id and the day: pieces that score the same take turns from day to day
// Then it is picked greedily, best first, with caps so the wall is not one person or one kind of piece:
//   at most 2 per owner, and at most 70% of one type (a second pass fills any remaining places without the type cap).
export interface Candidate { id: string; owner: string; type: string; published: number; pins: number; remixes: number }
export interface ShowcaseOptions { size: number; perOwner: number; halfLifeDays: number; maxShare: number; now: number }
export const SHOWCASE_DEFAULTS = { size: 24, perOwner: 2, halfLifeDays: 10, maxShare: 0.7 } as const;
const DAY = 86_400_000;

// a stable number in [0, 1) from text
function unit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export function score(c: Candidate, now: number, halfLifeDays: number = SHOWCASE_DEFAULTS.halfLifeDays): number {
  const age = Math.max(0, (now - c.published) / DAY);
  const fresh = age < 1 ? 1.5 : 1;
  const signals = 1 + 3 * c.pins + 2 * c.remixes;
  return signals * fresh * Math.pow(0.5, age / halfLifeDays) + unit(c.id + Math.floor(now / DAY)) * 1e-6;
}

export function pickShowcase(cands: Candidate[], o: Partial<ShowcaseOptions> & { now: number }): { picked: Candidate[]; scores: Map<string, number> } {
  const opt = { ...SHOWCASE_DEFAULTS, ...o };
  const scores = new Map(cands.map((c) => [c.id, score(c, opt.now, opt.halfLifeDays)] as const));
  const ranked = [...cands].sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (a.id < b.id ? -1 : 1));
  const picked: Candidate[] = [];
  const owners = new Map<string, number>(), types = new Map<string, number>();
  const typeCap = Math.max(1, Math.ceil(opt.maxShare * opt.size));
  const take = (c: Candidate) => {
    picked.push(c);
    owners.set(c.owner, (owners.get(c.owner) ?? 0) + 1);
    types.set(c.type, (types.get(c.type) ?? 0) + 1);
  };
  for (const pass of [1, 2]) {
    for (const c of ranked) {
      if (picked.length >= opt.size) break;
      if (picked.includes(c)) continue;
      if ((owners.get(c.owner) ?? 0) >= opt.perOwner) continue;
      if (pass === 1 && (types.get(c.type) ?? 0) >= typeCap) continue;
      take(c);
    }
  }
  // present in score order
  picked.sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (a.id < b.id ? -1 : 1));
  return { picked, scores };
}
