// What the create and edit wizards share: the manual, pulling code out of a reply, the compile-and-fix loop, and the
// trail (what each step did, for the person and for debugging).
import { Wizard, extractJson } from '@studiomorgana/wizard';
import { MANUAL, type Chapter } from '../manual.gen';
import { check, type GtChecked, type GtDiagnostic } from '../gt/checker.gen.js';
import type { Models } from './models';

export { extractJson };

// The wizard engine narrates every step with console.log; in production that is noise in the logs. Drop those lines and
// keep our own: one structured line per piece or edit (see `log`).
const keep = console.log.bind(console);
console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && /^\s*[\u25B6\u25C7] /.test(a[0])) return; keep(...a); };
export function log(event: string, data: Record<string, unknown>) { keep(JSON.stringify({ event, ...data })); }

// ── the manual ────────────────────────────────────────────────────────────────────────────────────────────────────
const BY_ID = new Map(MANUAL.map((c) => [c.id, c]));
export const CORE = MANUAL.filter((c) => c.core);

// the table of contents the reader picks from: one line per chapter
export function contents(): string {
  return MANUAL.filter((c) => !c.core).map((c) => `- ${c.id}: ${c.title}${c.about && c.about !== c.title && !c.title.includes(c.about) ? ' — ' + c.about : ''}`).join('\n');
}

// ids the reader asked for, plus the chapters any piece of that kind needs, in manual order
export function chaptersFor(ids: unknown, o: { kind?: string; english?: boolean } = {}): Chapter[] {
  const want = new Set<string>((Array.isArray(ids) ? ids : []).map(String).filter((id) => BY_ID.has(id)));
  for (const id of ['things', 'make-give', 'names']) want.add(id);
  if (o.kind === 'video' || o.kind === 'stage') { want.add('video'); want.add('verb:let-2'); }
  if (!o.kind || o.kind === 'canvas' || o.kind === 'poster') want.add('layout');
  if (![...want].some((id) => id.startsWith('example:'))) want.add(o.kind === 'video' ? 'example:a-video-with-events-move' : 'example:a-launch-poster-duotone-photo');
  return MANUAL.filter((c) => !c.core && want.has(c.id));
}

export function systemFor(chapters: Chapter[]): string {
  return [...CORE, ...chapters].map((c) => c.text).join('\n\n');
}

// chapters that speak to the words a compiler error is about
export function chaptersForErrors(diags: GtDiagnostic[], source: string): Chapter[] {
  const lines = source.split('\n'), ids = new Set<string>();
  for (const d of diags) {
    const first = (lines[(d.line || 1) - 1] || '').trim().split(/\s+/)[0]?.toLowerCase();
    if (first && BY_ID.has('verb:' + first)) ids.add('verb:' + first);
    if (first && BY_ID.has('verb:' + first + '-2')) ids.add('verb:' + first + '-2');
    if (/colour|material|word I know|font/i.test(d.msg)) { ids.add('words'); ids.add('names'); }
    if (/nothing called|put it|under|beside|above/i.test(d.msg)) ids.add('layout');
  }
  return MANUAL.filter((c) => ids.has(c.id));
}

// ── replies ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function codeOf(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:gt|godtongue)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const src = (fenced.sort((a, b) => b.length - a.length)[0] ?? text).trim();
  if (!/^(--.*\n|\s*\n)*\s*(create|let there be)\b/im.test(src)) return null;
  return src + '\n';
}

export const numbered = (source: string) => source.replace(/\n$/, '').split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');

export function describeErrors(diags: GtDiagnostic[], source: string): string {
  const lines = source.split('\n');
  return diags.filter((d) => d.level === 'error' && !d.follows).slice(0, 12).map((d) => {
    const at = d.line ? `line ${d.line}: ${(lines[d.line - 1] || '').trim()}` : 'the piece';
    return `- ${at}\n  error: ${d.msg.replace(/^internal: /, '')}${d.hint ? `\n  hint: ${d.hint}` : ''}${d.fix ? `\n  the compiler suggests: "${d.fix.replace}"` : ''}`;
  }).join('\n');
}

// the compiler's own "did you mean" fixes, applied without asking a model (right to left on each line)
export function applyCompilerFixes(source: string, diags: GtDiagnostic[]): string | null {
  const fixes = diags.filter((d) => d.level === 'error' && d.fix && d.range);
  if (!fixes.length) return null;
  const lines = source.split('\n');
  for (const d of fixes.sort((a, b) => b.range!.line - a.range!.line || b.range!.col - a.range!.col)) {
    const r = d.range!, l = lines[r.line - 1];
    if (l == null) continue;
    lines[r.line - 1] = l.slice(0, r.col - 1) + d.fix!.replace + l.slice(r.col - 1 + r.len);
  }
  const out = lines.join('\n');
  return out === source ? null : out;
}

// ── the trail ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Step { step: string; by: 'reader' | 'writer' | 'compiler'; ms: number; note: string }
export function stamp(s: { trail?: Step[] }, step: string, by: Step['by'], t0: number, note: string): Step[] {
  return [...(s.trail || []), { step, by, ms: Date.now() - t0, note: note.slice(0, 300) }];
}

// a Wizard whose text steps go to the reader or the writer by the step's model ("reader" / "writer")
export function wizardOf(models: Models): Wizard {
  return new Wizard({
    generateText: ({ instructions, model, maxTokens }: { instructions: string; model?: string; maxTokens?: number }) =>
      model === 'writer' ? models.write({ prompt: instructions, maxTokens }) : models.read({ prompt: instructions, maxTokens }),
  }, { maxRetries: 2 });
}

// ── compile, and fix what the compiler rejects ────────────────────────────────────────────────────────────────────
// Adds three steps to a wizard: "check" (compile the state's source), "fix" (the writer corrects it, then back to
// check) and "done". State in: source, system, files, rounds. State out: source, checked, round, trail.
export interface LoopState {
  source: string; system: string; files: Record<string, Uint8Array>; rounds: number; round?: number;
  checked?: GtChecked; trail?: Step[]; _error?: string;
}
export function addCheckLoop(w: Wizard, models: Models, request: (s: any) => string) {
  w.addComputeStep({
    id: 'check',
    handler: ({ state, setState }) => {
      const t0 = Date.now();
      let source: string = state.source, checked = check(source, state.files);
      let note = checked.ok ? 'compiles' : `${errorsOf(checked).length} errors`;
      // first the compiler's own suggestions: free, and often enough
      if (!checked.ok) {
        const fixed = applyCompilerFixes(source, checked.diagnostics);
        if (fixed) {
          const again = check(fixed, state.files);
          if (errorsOf(again).length < errorsOf(checked).length) { source = fixed; checked = again; note += `; applied the compiler's suggestions → ${checked.ok ? 'compiles' : errorsOf(checked).length + ' errors'}`; }
        }
      }
      setState((s: LoopState) => ({ ...s, source, checked, trail: stamp(s, 'check', 'compiler', t0, note) }));
      if (checked.ok || (state.round ?? 0) >= state.rounds) return w.signal.goto('done');
      return w.signal.skip;
    },
  });
  w.addComputeStep({
    id: 'fix',
    handler: async ({ state, setState }) => {
      const t0 = Date.now(), s = state as LoopState, round = (s.round ?? 0) + 1;
      const extra = chaptersForErrors(s.checked!.diagnostics, s.source);
      const reply = await models.write({
        system: s.system + (extra.length ? '\n\n' + extra.map((c) => c.text).join('\n\n') : ''),
        prompt: [
          request(s),
          'Your source does not compile yet. The line numbers on the left are for reference only:',
          '```', numbered(s.source), '```',
          'Compiler errors:', describeErrors(s.checked!.diagnostics, s.source),
          'Fix these errors and keep everything else as it is. Return the complete corrected source, without line numbers, in one ```gt block.',
        ].join('\n\n'),
      });
      const code = codeOf(reply);
      setState((p: LoopState) => ({ ...p, round, source: code ?? p.source, trail: stamp(p, `fix ${round}`, 'writer', t0, code ? 'rewrote the source' : 'the reply had no source in it') }));
      return w.signal.goto('check');
    },
  });
  w.addComputeStep({ id: 'done', handler: () => w.signal.stop });
}
export const errorsOf = (c: GtChecked) => c.diagnostics.filter((d) => d.level === 'error');

// run a wizard to its end and hand back its state; a failed step becomes a thrown error
export async function runToEnd<T>(w: Wizard, state: T): Promise<T & { trail: Step[] }> {
  const out = await w.run(state);
  if (out?._error) throw new Error(String(out._error));
  return out;
}
