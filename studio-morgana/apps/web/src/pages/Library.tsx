// Admin → Library. Pick a folder (or SVG files) and optionally a catalogue, convert them to godtongue stamps here,
// upload them (the Worker compiles each one), then review, edit and publish from the grid.
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { svgToStamp } from '../lib/svgstamp.js';
import { meStore, toast } from '../lib/session';
import { useStore } from '../lib/store';

type Status = 'draft' | 'published' | 'hidden';
interface Stamp { slug: string; name: string; words: string[]; tags: string[]; parts: { name: string; area: number }[]; source: string; credit: string; status: Status; svg: string }
interface Catalogue { name?: string; words?: string[]; tags?: string[] }
interface Converted { slug: string; name: string; words: string[]; tags: string[]; parts: { name: string; area: number }[]; source: string; credit: string; gt: string; svg: string; notes: string[]; error?: string }

const cap = (s: string) => s.replace(/(^|[\s-])(\w)/g, (_, a, b) => a + b.toUpperCase()).replace(/-/g, ' ');
const slugOf = (s: string) => s.toLowerCase().replace(/\.svg$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'i-$1').slice(0, 40);
const uri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

// a catalogue: a list of { file or slug, name, words, tags }, or an object keyed by file path or slug
function readCatalogue(text: string): Map<string, Catalogue> {
  const out = new Map<string, Catalogue>();
  const data = JSON.parse(text) as unknown;
  const entries: [string, Catalogue][] = Array.isArray(data)
    ? data.map((e: Record<string, unknown>) => [String(e.file ?? e.slug ?? ''), e as Catalogue])
    : Object.entries(data as Record<string, Catalogue>);
  for (const [key, val] of entries) {
    const k = key.replace(/\.svg$/i, '').split('/').pop()!.toLowerCase();
    out.set(k, val);
    out.set(key.replace(/\.svg$/i, '').toLowerCase(), val);
  }
  return out;
}

export default function Library() {
  const me = useStore(meStore, (m) => m);
  const isAdmin = me?.user?.role === 'admin';
  if (me && !isAdmin) return <div className="page lib-page"><p className="lib-note">Admins only.</p></div>;
  return isAdmin ? <Admin /> : <div className="page lib-page" aria-busy="true" />;
}

function Admin() {
  const [files, setFiles] = useState<File[]>([]);
  const [catalogue, setCatalogue] = useState<Map<string, Catalogue> | null>(null);
  const [licence, setLicence] = useState('game-icons.net, CC BY 3.0');
  const [converted, setConverted] = useState<Converted[] | null>(null);
  const [busy, setBusy] = useState('');
  const [uploadLog, setUploadLog] = useState<string[]>([]);

  const [filter, setFilter] = useState<'all' | Status>('draft');
  const [stamps, setStamps] = useState<Stamp[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const reload = async () => {
    const r = await api<{ stamps: Stamp[]; counts: Record<string, number> }>(`/admin/library?status=${filter}`);
    setStamps(r.stamps); setCounts(r.counts);
  };
  useEffect(() => { setPicked(new Set()); void reload().catch((e) => toast(e instanceof ApiError ? e.message : 'Could not load the library')); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickCatalogue(f: File | undefined) {
    if (!f) { setCatalogue(null); return; }
    try { setCatalogue(readCatalogue(await f.text())); toast('Catalogue read'); }
    catch { toast('That catalogue is not valid JSON'); }
  }

  // convert every SVG in the chosen files; a duplicate name gets its artist's name added
  async function convert() {
    setBusy('Converting…');
    const seen = new Map<string, number>();
    const out: Converted[] = [];
    for (const f of files) {
      if (!/\.svg$/i.test(f.name)) continue;
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const parts = rel.split('/');
      const artist = parts.length > 1 ? parts[parts.length - 2] : '';
      const base = slugOf(f.name);
      const cat = catalogue?.get(base) ?? catalogue?.get(rel.replace(/\.svg$/i, '').toLowerCase());
      let slug = base;
      if (seen.has(slug)) slug = slugOf(`${base}-${artist || seen.get(slug)}`);
      seen.set(base, (seen.get(base) ?? 0) + 1);
      const name = cat?.name || cap(slug);
      try {
        const r = svgToStamp(await f.text(), { name: slug });
        if (!r.ok) { out.push({ slug, name, words: [], tags: [], parts: [], source: rel, credit: '', gt: '', svg: '', notes: r.notes, error: r.notes?.[0] ?? 'could not convert' }); continue; }
        out.push({
          slug, name,
          words: cat?.words?.length ? cat.words : [slug.replace(/-/g, ' ')],
          tags: cat?.tags ?? [],
          parts: r.parts ?? [],
          source: rel,
          credit: artist ? `${cap(artist)}, ${licence}` : licence,
          gt: r.gt ?? '', svg: r.svg ?? '', notes: r.notes ?? [],
        });
      } catch (e) {
        out.push({ slug, name, words: [], tags: [], parts: [], source: rel, credit: '', gt: '', svg: '', notes: [], error: (e as Error).message });
      }
      if (out.length % 50 === 0) { setBusy(`Converting… ${out.length}`); await new Promise((res) => setTimeout(res, 0)); }
    }
    setConverted(out);
    setBusy('');
  }

  // upload the converted stamps in batches; the Worker compiles each and stores it as a draft
  async function upload() {
    if (!converted) return;
    const ready = converted.filter((c) => c.gt);
    setUploadLog([]);
    let stored = 0;
    const failed: string[] = [];
    for (let i = 0; i < ready.length; i += 100) {
      setBusy(`Uploading ${Math.min(i + 100, ready.length)} of ${ready.length}…`);
      const items = ready.slice(i, i + 100).map(({ notes: _n, error: _e, ...rest }) => rest);
      const r = await api<{ results: { slug: string; ok: boolean; message?: string }[]; stored: number }>('/admin/library/import', { method: 'POST', body: { items } });
      stored += r.stored;
      for (const x of r.results) if (!x.ok) failed.push(`${x.slug}: ${x.message}`);
    }
    setBusy('');
    setUploadLog([`${stored} stored as drafts.`, ...failed]);
    setConverted(null); setFiles([]);
    void reload();
  }

  async function setStatus(slugs: string[], status: Status) {
    if (!slugs.length) return;
    await api('/admin/library/status', { method: 'POST', body: { slugs, status } });
    setPicked(new Set());
    toast(`${slugs.length} ${status === 'published' ? 'published' : status === 'hidden' ? 'hidden' : 'back to drafts'}`);
    void reload();
  }

  async function saveEdit(s: Stamp, patch: { name: string; words: string; tags: string }) {
    await api(`/admin/library/${s.slug}`, { method: 'PATCH', body: { name: patch.name, words: splitList(patch.words), tags: splitList(patch.tags) } });
    setEditing(null); void reload();
  }

  async function remove(s: Stamp) {
    if (!window.confirm(`Delete “${s.name}” from the library? This cannot be undone.`)) return;
    await api(`/admin/library/${s.slug}`, { method: 'DELETE' });
    setEditing(null); void reload();
  }

  const toggle = (slug: string) => setPicked((p) => { const n = new Set(p); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  const okCount = converted?.filter((c) => c.gt).length ?? 0;
  const tabs: [('all' | Status), string][] = [['draft', 'Drafts'], ['published', 'Published'], ['hidden', 'Hidden'], ['all', 'All']];
  // the search box matches name, words and tags, so a group ("food") can be picked and published together
  const shown = useMemo(() => {
    const all = stamps ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.filter((s) => [s.name, s.slug, ...s.words, ...s.tags].some((x) => x.toLowerCase().includes(t)));
  }, [stamps, q]);

  return (
    <div className="page lib-page">
      <h1 className="lib-title">Library</h1>
      <p className="lib-note">Drop a folder of SVG drawings. Each one becomes a godtongue stamp here, and the Worker compiles it before anything is stored.</p>

      <section className="lib-panel">
        <div className="lib-row">
          <label className="lib-btn">Choose a folder<input type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
          <label className="lib-btn">Or choose SVG files<input type="file" hidden multiple accept=".svg,image/svg+xml" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
          <label className="lib-btn">Catalogue (optional, JSON)<input type="file" hidden accept=".json,application/json" onChange={(e) => void pickCatalogue(e.target.files?.[0])} /></label>
          <label className="lib-field">Licence line <input value={licence} onChange={(e) => setLicence(e.target.value)} /></label>
        </div>
        <p className="lib-note">{files.length ? `${files.length} files chosen` : 'No files chosen yet'}{catalogue ? ` · catalogue with ${catalogue.size} entries` : ''}</p>
        <div className="lib-row">
          <button className="lib-btn primary" disabled={!files.length || !!busy} onClick={() => void convert()}>Convert</button>
          {converted && <button className="lib-btn primary" disabled={!okCount || !!busy} onClick={() => void upload()}>Upload {okCount} as drafts</button>}
          {busy && <span className="lib-note">{busy}</span>}
        </div>
        {converted && (
          <details className="lib-report" open>
            <summary>{okCount} ready · {converted.length - okCount} could not be converted</summary>
            <ul>{converted.filter((c) => !c.gt).slice(0, 200).map((c) => <li key={c.source}>{c.source}: {c.error}</li>)}</ul>
          </details>
        )}
        {uploadLog.length > 0 && <details className="lib-report" open><summary>{uploadLog[0]}</summary><ul>{uploadLog.slice(1, 200).map((l) => <li key={l}>{l}</li>)}</ul></details>}
      </section>

      <section className="lib-panel">
        <div className="lib-row lib-tabs">
          {tabs.map(([k, label]) => (
            <button key={k} className={`lib-tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {label}{k !== 'all' ? ` ${counts[k] ?? 0}` : ` ${Object.values(counts).reduce((a, b) => a + b, 0)}`}
            </button>
          ))}
        </div>
        <div className="lib-row">
          <input className="lib-search" placeholder="Search name, words or tags" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="lib-note">{shown.length} shown · {picked.size} selected</span>
          <button className="lib-btn" disabled={!picked.size} onClick={() => void setStatus([...picked], 'published')}>Publish selected</button>
          <button className="lib-btn" disabled={!picked.size} onClick={() => void setStatus([...picked], 'hidden')}>Hide selected</button>
          <button className="lib-btn" disabled={!picked.size} onClick={() => void setStatus([...picked], 'draft')}>Back to drafts</button>
          <button className="lib-btn" disabled={!shown.length} onClick={() => setPicked(new Set(shown.map((s) => s.slug)))}>Select all shown</button>
          <button className="lib-btn" disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</button>
        </div>

        {stamps === null ? <p className="lib-note">Loading…</p> : shown.length === 0 ? <p className="lib-note">Nothing here yet.</p> : (
          <div className="lib-grid">
            {shown.map((s) => (
              <div key={s.slug} className={`lib-card ${picked.has(s.slug) ? 'on' : ''}`}>
                <button className="lib-thumb" onClick={() => toggle(s.slug)} aria-pressed={picked.has(s.slug)} title={s.slug}>
                  {s.svg ? <img src={uri(s.svg)} alt="" /> : null}
                </button>
                <div className="lib-meta">
                  <strong>{s.name}</strong> <span className={`lib-status ${s.status}`}>{s.status}</span>
                  <div className="lib-sub">{s.words.join(', ') || '—'}</div>
                  <div className="lib-sub">{s.tags.join(', ')}</div>
                  <button className="lib-link" onClick={() => setEditing(editing === s.slug ? null : s.slug)}>{editing === s.slug ? 'Close' : 'Edit'}</button>
                </div>
                {editing === s.slug && <EditCard s={s} onSave={saveEdit} onDelete={remove} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EditCard({ s, onSave, onDelete }: { s: Stamp; onSave: (s: Stamp, p: { name: string; words: string; tags: string }) => Promise<void>; onDelete: (s: Stamp) => Promise<void> }) {
  const [name, setName] = useState(s.name);
  const [words, setWords] = useState(s.words.join(', '));
  const [tags, setTags] = useState(s.tags.join(', '));
  return (
    <div className="lib-edit">
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Words a brief might use <input value={words} onChange={(e) => setWords(e.target.value)} /></label>
      <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      <div className="lib-row">
        <button className="lib-btn primary" onClick={() => void onSave(s, { name, words, tags })}>Save</button>
        <button className="lib-btn" onClick={() => void onDelete(s)}>Delete</button>
      </div>
      <p className="lib-sub">{s.credit}</p>
    </div>
  );
}
