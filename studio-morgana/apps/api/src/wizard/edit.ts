// Changing a piece on request.
//   understand (reader: the request, the picture as it is, the things in it) → [answer, if it was a question]
//   → patch (writer: only the lines that change) → check → fix → check … → done
// A patch keeps the rest of the source exactly as it was, which a whole rewrite does not.
import type { GtChecked, GtElement } from '../gt/checker.gen.js';
import { check } from '../gt/checker.gen.js';
import type { Img, Models } from './models';
import { addCheckLoop, chaptersFor, codeOf, contents, extractJson, numbered, runToEnd, stamp, systemFor, wizardOf, type LoopState, type Step } from './common';

export interface PartBrief { n: number; name: string; face?: string; lines: number[] }
export interface EditRequest {
  source: string; text: string; parts: PartBrief[];
  picture?: Img | null;                  // the render the person is looking at
  images: Img[];                         // the piece's files (only names are needed by the writer)
}
export interface Understanding {
  intent: 'change' | 'add' | 'remove' | 'restyle' | 'layout' | 'question';
  targets: string[]; plan: string; answer?: string; chapters: string[];
}
export interface Edited { source: string; ok: boolean; checked: GtChecked | null; rounds: number; understood: Understanding; answer?: string; trail: Step[] }

const INTENTS = ['change', 'add', 'remove', 'restyle', 'layout', 'question'];

function elementsList(els: Record<string, GtElement>): string {
  return Object.values(els).slice(0, 80).map((e) => {
    const [x0, y0, x1, y1] = e.box;
    return `- ${e.name} (line ${e.line ?? '?'}): ${e.kind}${e.text ? ` "${e.text.slice(0, 30)}"` : ''}, ${Math.round(x1 - x0)}×${Math.round(y1 - y0)} at ${Math.round((x0 + x1) / 2)},${Math.round((y0 + y1) / 2)}${e.fill ? ', ' + e.fill.slice(0, 40) : ''}${e.looks.length ? '; ' + e.looks.slice(0, 3).join('; ') : ''}`;
  }).join('\n');
}

// ── patches ───────────────────────────────────────────────────────────────────────────────────────────────────────
//   REPLACE 12-14        INSERT AFTER 20       DELETE 7-8
//   <new lines>          <new lines>
//   END                  END
// Line numbers are those of the source the writer was shown; edits apply from the bottom up so they do not shift.
export interface Edit { op: 'replace' | 'insert' | 'delete'; from: number; to: number; lines: string[] }
export function parsePatch(text: string): Edit[] | null {
  const body = (text.match(/```(?:patch|diff)?[ \t]*\n([\s\S]*?)```/) || [, text])[1]!;
  const out: Edit[] = [];
  const ls = body.split('\n');
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i].trim();
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^DELETE\s+(\d+)(?:\s*-\s*(\d+))?$/i))) { out.push({ op: 'delete', from: +m[1], to: +(m[2] ?? m[1]), lines: [] }); continue; }
    if ((m = l.match(/^REPLACE\s+(\d+)(?:\s*-\s*(\d+))?$/i)) || (m = l.match(/^INSERT\s+AFTER\s+(\d+)$/i))) {
      const block: string[] = [];
      for (i++; i < ls.length && ls[i].trim().toUpperCase() !== 'END'; i++) block.push(ls[i].replace(/^\s*\d+\|\s?/, ''));
      out.push(/^INSERT/i.test(l) ? { op: 'insert', from: +m[1], to: +m[1], lines: block } : { op: 'replace', from: +m[1], to: +(m[2] ?? m[1]), lines: block });
    }
  }
  return out.length ? out : null;
}
export function applyPatch(source: string, edits: Edit[]): string {
  const lines = source.replace(/\n$/, '').split('\n'), n = lines.length;
  const sorted = [...edits].sort((a, b) => b.from - a.from || (a.op === 'insert' ? -1 : 1));
  for (const e of sorted) {
    if (e.from < (e.op === 'insert' ? 0 : 1) || e.to > n || e.to < e.from) throw new Error(`the patch points at line ${e.from}${e.to !== e.from ? '-' + e.to : ''}, outside the source`);
    if (e.op === 'insert') lines.splice(e.from, 0, ...e.lines);
    else lines.splice(e.from - 1, e.to - e.from + 1, ...(e.op === 'replace' ? e.lines : []));
  }
  return lines.join('\n') + '\n';
}

export async function editPiece(models: Models, o: EditRequest & { files: Record<string, Uint8Array>; rounds: number }): Promise<Edited> {
  const before = check(o.source, o.files);
  const parts = o.parts.map((p) => `P${p.n} = "${p.name}"${p.face ? ` (${p.face})` : ''}, lines ${p.lines.join(', ')}`).join('\n');
  const w = wizardOf(models);
  w.addComputeStep({
    id: 'understand',
    handler: async ({ setState }) => {
      const t0 = Date.now();
      const reply = await models.read({
        prompt: [
          'A person is editing a design written in godtongue (plain English that compiles to a picture).',
          o.picture ? 'The image is the design as it looks now.' : '',
          `They asked: "${o.text}"`,
          'The things in the design (name, the line that makes it, what it is, size and centre in pixels, colour and effects):', elementsList(before.elements) || '(none named)',
          parts ? `Numbered parts they can refer to:\n${parts}` : '',
          'Chapters of the godtongue manual:', contents(),
          `Reply with JSON: { "intent": one of ${INTENTS.join(' | ')}, "targets": [names of the things to change, from the list], "plan": "exactly what to change, in a few plain sentences, with colours as hex and sizes in pixels", "answer": "only when the intent is question: the answer", "chapters": [3 to 6 chapter ids the writer needs] }`,
        ].filter(Boolean).join('\n\n'),
        images: o.picture ? [o.picture] : [], maxTokens: 800,
      });
      const j = extractJson(reply) || {};
      const understood: Understanding = {
        intent: INTENTS.includes(j.intent) ? j.intent : 'change',
        targets: (Array.isArray(j.targets) ? j.targets : []).map(String).filter((t: string) => before.elements[t] || o.source.includes(t)).slice(0, 20),
        plan: String(j.plan || o.text), answer: j.answer ? String(j.answer) : undefined,
        chapters: (Array.isArray(j.chapters) ? j.chapters : []).map(String),
      };
      setState((s: any) => ({ ...s, understood, trail: stamp(s, 'understand', 'reader', t0, `${understood.intent}${understood.targets.length ? ': ' + understood.targets.join(', ') : ''}`) }));
      return understood.intent === 'question' && understood.answer ? w.signal.stop : w.signal.skip;
    },
  });
  const request = (s: any) => [
    `The person asked: "${o.text}"`,
    s.understood ? `What to change (from a designer who looked at the picture): ${s.understood.plan}${s.understood.targets.length ? `\nThings involved: ${s.understood.targets.join(', ')}` : ''}` : '',
    o.images.length ? `Images the piece may print (and only these): ${o.images.map((i) => '@' + i.name).join(', ')}` : '',
  ].filter(Boolean).join('\n\n');
  w.addComputeStep({
    id: 'patch',
    handler: async ({ state, setState }) => {
      const t0 = Date.now();
      const system = systemFor(chaptersFor(state.understood?.chapters, { kind: before.kind ?? undefined }));
      const reply = await models.write({
        system,
        prompt: [
          'Current source (the line numbers on the left are for reference only):', '```', numbered(o.source), '```',
          parts ? `Numbered parts the person can refer to (P1 is "p1"):\n${parts}` : '',
          request(state),
          'Change only what was asked. Reply with a patch in one ```patch block, using the line numbers above:',
          '  REPLACE 12-14   (then the new lines, then END)\n  INSERT AFTER 20 (then the new lines, then END)\n  DELETE 7-8',
          'Write new lines in the same style as the source. If the change touches most of the source, reply instead with the complete new source in one ```gt block.',
        ].filter(Boolean).join('\n\n'),
        temperature: 0.4,
      });
      let source: string | null = null, note = '';
      const edits = parsePatch(reply);
      if (edits) { try { source = applyPatch(o.source, edits); note = `${edits.length} edit${edits.length > 1 ? 's' : ''} to the source`; } catch (e) { note = (e as Error).message; } }
      if (!source) { source = codeOf(reply); if (source) note = 'rewrote the source'; }
      if (!source) {
        if ((state.tries ?? 0) >= 1) return w.signal.fail('the writer did not send a change');
        setState((s: any) => ({ ...s, tries: (s.tries ?? 0) + 1, trail: stamp(s, 'patch', 'writer', t0, (note || 'no patch in the reply') + '; asking again') }));
        return w.signal.retry();
      }
      setState((s: any) => ({ ...s, source, system, trail: stamp(s, 'patch', 'writer', t0, note) }));
      return w.signal.skip;
    },
  });
  addCheckLoop(w, models, request);
  const out = await runToEnd<LoopState & { understood: Understanding }>(w, { source: o.source, system: '', files: o.files, rounds: o.rounds, round: 0, trail: [] } as any);
  const answered = out.understood?.intent === 'question' && !!out.understood.answer;
  return {
    source: answered ? o.source : out.source, ok: answered ? before.ok : !!out.checked?.ok, checked: answered ? before : out.checked ?? null,
    rounds: out.round ?? 0, understood: out.understood, answer: answered ? out.understood.answer : undefined, trail: out.trail,
  };
}

// ── after the browser has drawn a change: does the picture do what was asked? ───────────────────────────────────
export interface Review { ok: boolean; issues: string[]; summary: string }
export async function reviewRender(models: Models, o: { text: string; picture: Img; source: string }): Promise<Review> {
  const reply = await models.read({
    prompt: [
      `A design was just changed because the person asked: "${o.text}". The image is the result.`,
      'Does the image do what they asked, and is anything clearly broken (text cut off or overlapping, things off the page, unreadable contrast, empty areas that should have something)?',
      'Reply with JSON: { "ok": true or false, "issues": ["short, concrete problems, each one a thing to change"], "summary": "one sentence" }. Only list real problems; an empty list when it is fine.',
    ].join('\n\n'),
    images: [o.picture], maxTokens: 500,
  });
  const j = extractJson(reply) || {};
  const issues = (Array.isArray(j.issues) ? j.issues : []).map(String).filter(Boolean).slice(0, 6);
  return { ok: j.ok !== false && !issues.length, issues, summary: String(j.summary || (issues.length ? issues[0] : 'looks as asked')) };
}
