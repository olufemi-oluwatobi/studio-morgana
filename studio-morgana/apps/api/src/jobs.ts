// Scheduled jobs. The cron trigger (wrangler.jsonc) calls runJobs every six hours; an admin can run them any time
// (POST /api/admin/jobs/run, or "Refresh showcase" in the sidebar). Every run is recorded in job_runs.
import type { Env } from './env';
import { now } from './util';
import { pickShowcase, SHOWCASE_DEFAULTS, type Candidate } from './showcase';

export type JobName = 'showcase' | 'housekeeping';
export interface JobResult { job: JobName; ran: number; ms: number; [k: string]: unknown }

async function record(env: Env, r: JobResult) {
  await env.DB.prepare('INSERT INTO job_runs (name, ran, ms, result) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET ran = excluded.ran, ms = excluded.ms, result = excluded.result')
    .bind(r.job, r.ran, r.ms, JSON.stringify(r)).run();
}

// public, finished pieces that have posters; the curated (featured) ones are left out, they are already on top.
// A piece's signals are other people's pins on their projects and other people's remixes of it.
const ELIGIBLE = `
  SELECT p.id, p.owner, p.type, COALESCE(p.published, p.updated) AS published,
    (SELECT COUNT(DISTINCT pr.owner) FROM project_pins pp JOIN projects pr ON pr.id = pp.project_id
       WHERE pp.piece_id = p.id AND pr.deleted = 0 AND pr.owner <> p.owner) AS pins,
    (SELECT COUNT(DISTINCT c.owner) FROM pieces c WHERE c.parent_id = p.id AND c.deleted = 0 AND c.owner <> p.owner) AS remixes
  FROM pieces p
  WHERE p.visibility = 'public' AND p.deleted = 0 AND p.status = 'ready' AND p.version_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM outputs o WHERE o.version_id = p.version_id AND o.name = 'poster-480')
    AND p.id NOT IN (SELECT piece_id FROM collection_items WHERE slug = 'featured')
  ORDER BY COALESCE(p.published, p.updated) DESC LIMIT 1000`;

export async function refreshShowcase(env: Env): Promise<JobResult> {
  const t0 = Date.now(), t = now();
  const { results } = await env.DB.prepare(ELIGIBLE).all<Candidate>();
  const { picked, scores } = pickShowcase(results, { now: t });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM collection_items WHERE slug = 'showcase'"),
    ...picked.map((c, i) => env.DB.prepare("INSERT INTO collection_items (slug, piece_id, position) VALUES ('showcase', ?, ?)").bind(c.id, i)),
  ]);
  const byType: Record<string, number> = {};
  for (const c of picked) byType[c.type] = (byType[c.type] ?? 0) + 1;
  const r: JobResult = {
    job: 'showcase', ran: t, ms: Date.now() - t0, eligible: results.length, picked: picked.length, size: SHOWCASE_DEFAULTS.size,
    owners: new Set(picked.map((c) => c.owner)).size, byType,
    top: picked.slice(0, 5).map((c) => ({ id: c.id, score: Math.round(scores.get(c.id)! * 1000) / 1000, pins: c.pins, remixes: c.remixes })),
  };
  await record(env, r);
  return r;
}

// sessions and sign-in tokens that have expired, and daily usage counters from before yesterday
export async function housekeeping(env: Env): Promise<JobResult> {
  const t0 = Date.now(), t = now();
  const cutoff = new Date(t - 3 * 86_400_000).toISOString().slice(0, 10);
  const [s, k, u] = await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(t),
    env.DB.prepare('DELETE FROM tokens WHERE expires < ?').bind(t),
    env.DB.prepare('DELETE FROM usage WHERE day < ?').bind(cutoff),
  ]);
  const r: JobResult = { job: 'housekeeping', ran: t, ms: Date.now() - t0, sessions: s.meta.changes, tokens: k.meta.changes, usage: u.meta.changes };
  await record(env, r);
  return r;
}

export async function runJobs(env: Env, only: JobName | 'all' = 'all'): Promise<JobResult[]> {
  const out: JobResult[] = [];
  // each job on its own: one failing must not stop the other
  for (const [name, fn] of [['showcase', refreshShowcase], ['housekeeping', housekeeping]] as const) {
    if (only !== 'all' && only !== name) continue;
    try { out.push(await fn(env)); }
    catch (e) { console.error(`job ${name} failed`, e); out.push({ job: name, ran: now(), ms: 0, error: (e as Error).message }); }
  }
  return out;
}
