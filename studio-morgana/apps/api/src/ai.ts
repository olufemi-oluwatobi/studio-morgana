// The model side, run as wizards (@studiomorgana/wizard): Llama 4 Scout reads (images, briefs, the manual, renders)
// and GPT-OSS writes godtongue; the godtongue compiler, running here in the Worker, checks every attempt and the writer
// fixes what it rejects, up to AI_ROUNDS times. AI_MODE=local swaps in a small built-in generator for offline work.
import type { Env } from './env';
import { FACTS } from './guide.gen';
import { localGenerate, localEdit } from './local-gen';
import { fail } from './util';
import { buildModels, roleReady, scriptedModels, type Img, type Models, ModelError } from './wizard/models';
import { planBrief, tidyPlan, writeOption, type Brief, type Planned } from './wizard/create';
import { editPiece, reviewRender, type Edited, type PartBrief, type Review } from './wizard/edit';
import { addCheckLoop, chaptersFor, runToEnd, systemFor, wizardOf, type LoopState, type Step } from './wizard/common';
import { check } from './gt/checker.gen.js';

export type { PartBrief };
export interface Diagnostic { level: string; line?: number; msg: string; hint?: string }

// 'live' = a real model answers; 'local' = the built-in generator (offline work); 'scripted' = stand-ins (tests)
export const aiMode = (env: Env): 'live' | 'local' | 'scripted' =>
  env.AI_MODE === 'scripted' ? 'scripted' : env.AI_MODE === 'local' || !(roleReady(env, 'read') && roleReady(env, 'write')) ? 'local' : 'live';
const rounds = (env: Env) => Math.max(0, Math.min(6, Number(env.AI_ROUNDS ?? 3) | 0));
let modelsOverride: ((env: Env) => Models) | null = null;
export function useModels(f: ((env: Env) => Models) | null) { modelsOverride = f; }          // tests script the models
const models = (env: Env) => (modelsOverride ? modelsOverride(env) : aiMode(env) === 'scripted' ? scripted : buildModels(env));
const scripted = scriptedModels((prompt, i, parts) => {
  if (!prompt.startsWith('edit:')) return localGenerate(prompt, i, []);
  const [ask, ...rest] = prompt.slice(5).split('\n');
  return localEdit(rest.join('\n'), parts || [], ask);
});
const busy = (e: unknown): never => {
  if (e instanceof ModelError) { console.error(e.message, e.cause); fail(502, e.message + '; try again in a moment'); }
  throw e;
};

// files as the wizards need them: bytes for the compiler (print reads its pictures) and images for the reader
export interface FileRef { name: string; key: string; type: string }
export async function readFiles(env: Env, refs: FileRef[]): Promise<{ images: Img[]; bytes: Record<string, Uint8Array> }> {
  const images: Img[] = [], bytes: Record<string, Uint8Array> = {};
  await Promise.all(refs.map(async (f) => {
    const o = await env.BUCKET.get(f.key);
    if (!o) return;
    const b = new Uint8Array(await o.arrayBuffer());
    bytes[f.name] = b;
    if (f.type.startsWith('image/') && f.type !== 'image/svg+xml') images.push({ name: f.name, mime: f.type, bytes: b });
  }));
  return { images: images.sort((a, b) => a.name!.localeCompare(b.name!)), bytes };
}
export async function pictureOf(env: Env, versionId: string): Promise<Img | null> {
  for (const name of ['poster-1200', 'poster-480']) {
    const o = await env.DB.prepare('SELECT key, type FROM outputs WHERE version_id = ? AND name = ?').bind(versionId, name).first<{ key: string; type: string }>();
    const obj = o && (await env.BUCKET.get(o.key));
    if (obj) return { name, mime: o!.type, bytes: new Uint8Array(await obj.arrayBuffer()) };
  }
  return null;
}

// ── making pieces: one plan, then one write per option ─────────────────────────────────────────────────────────────
export interface Made { source: string; ok: boolean; trail: Step[] }
export async function planFor(env: Env, o: { prompt: string; refs: string[]; files: FileRef[]; looksLike?: Img[] }): Promise<{ planned: Planned; brief: Brief; bytes: Record<string, Uint8Array> } | null> {
  if (aiMode(env) === 'local') return null;
  const { images, bytes } = await readFiles(env, o.files);
  const brief: Brief = { prompt: o.prompt, refs: o.refs, images, looksLike: o.looksLike ?? [] };
  try { return { planned: await planBrief(models(env), brief, [...FACTS.fonts]), brief, bytes }; }
  catch (e) {
    // no plan is not the end: the writer works from the brief alone
    console.error('planning failed', e);
    return { planned: { plan: tidyPlan({}, brief), chapters: chaptersFor([], {}), looks: '', trail: [{ step: 'plan', by: 'reader', ms: 0, note: 'the reader did not answer; writing from the brief' }] }, brief, bytes };
  }
}
export async function makeOption(env: Env, p: Awaited<ReturnType<typeof planFor>>, o: { prompt: string; uploads: string[]; i: number; n: number }): Promise<Made> {
  if (!p) return { source: localGenerate(o.prompt, o.i, o.uploads), ok: true, trail: [] };
  try { return await writeOption(models(env), { brief: p.brief, planned: p.planned, files: p.bytes, i: o.i, n: o.n, rounds: rounds(env) }); }
  catch (e) { return busy(e); }
}

// ── changing a piece ──────────────────────────────────────────────────────────────────────────────────────────────
export async function editFor(env: Env, o: { source: string; parts: PartBrief[]; text: string; versionId: string; files: FileRef[] }): Promise<Omit<Edited, 'checked'> & { diagnostics: Diagnostic[] }> {
  if (aiMode(env) === 'local') {
    const source = localEdit(o.source, o.parts, o.text);
    return { source, ok: true, rounds: 0, understood: { intent: 'change', targets: [], plan: o.text, chapters: [] }, trail: [], diagnostics: [] };
  }
  const [{ images, bytes }, picture] = await Promise.all([readFiles(env, o.files), pictureOf(env, o.versionId)]);
  try {
    const r = await editPiece(models(env), { source: o.source, text: o.text, parts: o.parts, picture, images, files: bytes, rounds: rounds(env) });
    return { ...r, diagnostics: r.checked?.diagnostics.filter((d) => d.level === 'error') ?? [] };
  } catch (e) { return busy(e); }
}

// a version that did not compile (written by hand or by an older writer): the fix loop alone
export async function repairFor(env: Env, o: { source: string; files: FileRef[] }): Promise<Made> {
  if (aiMode(env) === 'local') fail(422, 'the offline generator cannot repair sources; fix the line in the code box');
  const { bytes } = await readFiles(env, o.files);
  const m = models(env), first = check(o.source, bytes);
  const w = wizardOf(m);
  w.addComputeStep({ id: 'start', handler: () => w.signal.skip });
  addCheckLoop(w, m, () => 'Make this source compile, keeping the design.');
  try {
    const out = await runToEnd<LoopState>(w, { source: o.source, system: systemFor(chaptersFor([], { kind: first.kind ?? undefined })), files: bytes, rounds: Math.max(1, rounds(env)), round: 0, trail: [] });
    return { source: out.source, ok: !!out.checked?.ok, trail: out.trail };
  } catch (e) { return busy(e); }
}

// after the browser has drawn a version: does it do what was asked?
export async function reviewFor(env: Env, o: { versionId: string; text: string; source: string }): Promise<Review | null> {
  if (aiMode(env) === 'local') return null;
  const picture = await pictureOf(env, o.versionId);
  if (!picture) fail(409, 'that version has no picture yet');
  try { return await reviewRender(models(env), { text: o.text, picture: picture!, source: o.source }); }
  catch (e) { return busy(e); }
}
