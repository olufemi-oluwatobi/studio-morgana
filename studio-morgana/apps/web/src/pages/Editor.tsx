// Page 2: the editor. The piece in the middle; on the right its godtongue and, under it, the command input.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type PieceDetail, type PieceFile, type Version } from '../lib/api';
import { useStore } from '../lib/store';
import { meStore, toast } from '../lib/session';
import { linkHandler, navigate } from '../lib/router';
import { changedLines } from '../lib/diff';
import { deletePiece, patchPiece, upsertPiece } from '../lib/wall';
import { PinMenu } from '../components/PinMenu';
import { typeInfo } from '../lib/types';
import { compile, warmCompiler, type Diagnostic, type Part } from '../render/compiler';
import { PRIORITY } from '../render/host';
import { commit, download, encodePreview, exportImage, exportVideo, render, type Pin } from '../render/pipeline';
import { CodeBox, type CodeBoxHandle } from '../components/CodeBox';
import { Player } from '../components/Player';
import { ArrowLeft, Download, Pins, Send, Trash, Undo } from '../components/Icons';

type Phase = 'idle' | 'writing' | 'repairing' | 'rendering' | 'saving' | 'exporting';
const PHASE_TEXT: Record<Phase, string> = { idle: '', writing: 'Writing the change', repairing: 'Fixing the source', rendering: 'Rendering', saving: 'Saving', exporting: 'Exporting' };
const NONE: ReadonlySet<number> = new Set();
const EXPORT_LABEL = { png: 'Image (PNG)', mp4: 'Video (MP4)', gt: 'Godtongue (.gt)' } as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'piece';

export default function Editor({ id }: { id: string }) {
  const ai = useStore(meStore, (m) => m?.ai);
  const [d, setD] = useState<PieceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [changed, setChanged] = useState<ReadonlySet<number>>(NONE);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [shown, setShown] = useState<{ src: string; w: number | null; h: number | null } | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [view, setView] = useState<'image' | 'parts'>('image');
  const [phase, setPhase] = useState<Phase>('idle');
  const [video, setVideo] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [cmd, setCmd] = useState('');
  const [menu, setMenu] = useState(false);

  const alive = useRef(true);
  const pid = useRef<string | null>(null);
  const current = useRef<string | null>(null); // the version on screen; late work for older versions is dropped
  const code = useRef<CodeBoxHandle>(null);
  const cmdInput = useRef<HTMLInputElement>(null);
  const dRef = useRef(d); dRef.current = d;
  const good = useRef<{ pieceId: string; version: Version; files: PieceFile[] } | null>(null); // the last version that rendered: exports use it

  useEffect(() => { alive.current = true; warmCompiler(); return () => { alive.current = false; }; }, []);

  const makeVideo = useCallback(async (pieceId: string, v: Version, files: PieceFile[]) => {
    setVideo(null); setProgress(0);
    try {
      const url = await encodePreview(pieceId, v, files, (k) => { if (alive.current && current.current === v.id) setProgress(k); });
      if (alive.current && current.current === v.id && url) {
        setVideo(url);
        patchPiece(pieceId, { video: url });
      }
    } catch (e) { if (alive.current) toast('The video preview did not render: ' + (e as Error).message); }
    finally { if (alive.current && current.current === v.id) setProgress(null); }
  }, []);

  // compile, render, show; then save it as the piece's current version
  const show = useCallback(async (pieceId: string, v0: Version, files: PieceFile[], save: boolean): Promise<boolean> => {
    let v = v0;
    current.current = v.id;
    setPhase('rendering'); setDiags([]);
    let res = await render(pieceId, v.source, files, PRIORITY.interactive);
    if (!alive.current || current.current !== v0.id) return false;
    if (!res.ok && ai === 'workers-ai' && (v.by === 'ai' || v.by === 'repair')) {
      setPhase('repairing');
      const fixed = await api<{ version: Version }>(`/pieces/${pieceId}/repair`, { body: { versionId: v.id, diagnostics: res.diagnostics } });
      if (!alive.current) return false;
      setChanged(changedLines(v.source, fixed.version.source));
      v = fixed.version; current.current = v.id; setSource(v.source);
      setD((p) => (p ? { ...p, version: v } : p));
      setPhase('rendering');
      res = await render(pieceId, v.source, files, PRIORITY.interactive);
      if (!alive.current || current.current !== v.id) return false;
    }
    if (!res.ok) { setDiags(res.diagnostics); setPhase('idle'); return false; }
    const r = res.r;
    good.current = { pieceId, version: v, files };
    setShown({ src: r.lg, w: r.w, h: r.h }); setPins(r.pins); setParts(r.compiled.parts);
    if (save) {
      setPhase('saving');
      const card = await commit(pieceId, v, r);
      if (!alive.current) return true;
      setD((p) => (p ? { ...p, version: v, piece: { ...p.piece, ...card, versionId: v.id } } : p));
      upsertPiece(card);
    }
    setPhase('idle');
    if (r.compiled.video && save) void makeVideo(pieceId, v, files);
    return true;
  }, [ai, makeVideo]);

  // load the piece (not when the id changed because we just made our own copy of it)
  useEffect(() => {
    if (pid.current === id && dRef.current) return;
    pid.current = id;
    const ctl = new AbortController();
    setD(null); setLoadError(null); setShown(null); setParts(null); setPins(null); setDiags([]); setChanged(NONE); setVideo(null); setView('image'); setProgress(null);
    api<PieceDetail>(`/pieces/${id}`, { signal: ctl.signal }).then(async (det) => {
      if (ctl.signal.aborted) return;
      setD(det); setSource(det.version.source); current.current = det.version.id;
      if (det.piece.status === 'ready') good.current = { pieceId: det.piece.id, version: det.version, files: det.files };
      if (det.piece.lg) setShown({ src: det.piece.lg, w: det.piece.w, h: det.piece.h });
      setVideo(det.piece.video);
      if (det.piece.status !== 'ready' && det.piece.mine) { await show(det.piece.id, det.version, det.files, true); return; }
      const c = await compile('/p/' + det.piece.id, det.version.source, det.files);
      if (alive.current && c.ok) setParts(c.parts);
      if (det.piece.mine && det.piece.type === 'video' && !det.piece.video && c.ok && c.video) void makeVideo(det.piece.id, det.version, det.files);
    }).catch((e) => { if ((e as Error).name !== 'AbortError') setLoadError((e as Error).message); });
    return () => ctl.abort();
  }, [id, show, makeVideo]);

  // pins need a render (from the cache if this version was rendered in this visit)
  useEffect(() => {
    if (view !== 'parts' || pins || !d) return;
    let stop = false;
    render(d.piece.id, d.version.source, d.files, PRIORITY.interactive).then((r) => { if (!stop && r.ok) { setPins(r.r.pins); setParts(r.r.compiled.parts); } });
    return () => { stop = true; };
  }, [view, pins, d]);

  // a new version came back from the server: show it, and follow the piece if it was copied (a remix)
  const adopt = useCallback(async (r: { pieceId: string; version: Version; files?: PieceFile[] }, prevSource: string) => {
    const det = dRef.current!;
    const files = r.files ?? det.files;
    if (r.pieceId !== det.piece.id) { pid.current = r.pieceId; navigate('/p/' + r.pieceId, { replace: true }); toast('Saved as your own copy'); }
    setChanged(changedLines(prevSource, r.version.source));
    setSource(r.version.source);
    setD({ ...det, version: r.version, files, piece: { ...det.piece, id: r.pieceId, mine: true, pinnedIn: r.pieceId === det.piece.id ? det.piece.pinnedIn : [] } });
    setPins(null);
    await show(r.pieceId, r.version, files, true);
  }, [show]);

  const busy = phase !== 'idle';

  const submitCommand = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = cmd.trim(); const det = dRef.current;
    if (!text || busy || !det) return;
    setPhase('writing');
    try {
      // "p1" means nothing without the parts: if the piece has not compiled yet, compile it first
      let ps = parts;
      if (!ps) { const c = await compile('/p/' + det.piece.id, det.version.source, det.files); ps = c.ok ? c.parts : []; if (alive.current && c.ok) setParts(c.parts); }
      const r = await api<{ pieceId: string; version: Version; files: PieceFile[] }>(`/pieces/${det.piece.id}/command`, {
        body: { text, versionId: det.version.id, parts: ps.map((p) => ({ n: p.n, name: p.name, face: p.face, lines: p.lines })) },
      });
      if (!alive.current) return;
      setCmd('');
      await adopt(r, det.version.source);
    } catch (err) { toast((err as Error).message); if (alive.current) setPhase('idle'); }
  };

  const run = async () => {
    const det = dRef.current;
    if (!det || busy) return;
    if (source === det.version.source) { await show(det.piece.id, det.version, det.files, det.piece.status !== 'ready'); return; }
    setPhase('saving');
    try {
      const r = await api<{ pieceId: string; version: Version; files: PieceFile[] }>(`/pieces/${det.piece.id}/versions`, { body: { source, parentId: det.version.id } });
      if (alive.current) await adopt(r, det.version.source);
    } catch (err) { toast((err as Error).message); if (alive.current) setPhase('idle'); }
  };

  const undo = async () => {
    const det = dRef.current;
    if (!det?.version.parentId || busy) return;
    setPhase('saving');
    try {
      const prev = await api<PieceDetail>(`/pieces/${det.piece.id}?version=${det.version.parentId}`);
      const r = await api<{ pieceId: string; version: Version; files: PieceFile[] }>(`/pieces/${det.piece.id}/versions`, { body: { source: prev.version.source, parentId: det.version.id } });
      if (alive.current) await adopt(r, det.version.source);
    } catch (err) { toast((err as Error).message); if (alive.current) setPhase('idle'); }
  };

  const doExport = async (kind: 'png' | 'mp4' | 'gt') => {
    const det = dRef.current; setMenu(false);
    if (!det) return;
    const name = slug(det.piece.title);
    if (kind === 'gt') { download(new Blob([det.version.source], { type: 'text/plain' }), name + '.gt'); return; }
    const g = good.current ?? { pieceId: det.piece.id, version: det.version, files: det.files };
    setPhase('exporting'); setProgress(kind === 'mp4' ? 0 : null);
    try {
      if (kind === 'png') download(await exportImage(g.pieceId, g.version.source, g.files), name + '.png');
      else download(await exportVideo(g.pieceId, g.version.source, g.files, (k) => alive.current && setProgress(k)), name + '.mp4');
    } catch (err) { toast('Export failed: ' + (err as Error).message); }
    finally { if (alive.current) { setPhase('idle'); setProgress(null); } }
  };

  const errorLines = useMemo(() => new Set(diags.filter((x) => x.level === 'error' && x.line).map((x) => x.line!)), [diags]);
  const addPart = (n: number) => { setCmd((c) => (c.trim() ? c.trimEnd() + ' ' : '') + `p${n} `); cmdInput.current?.focus(); };
  const exports = typeInfo(d?.piece.type).exports;

  if (loadError) return <div className="page editor-page"><p className="note">Could not open this piece: {loadError}. <a href="/" onClick={linkHandler('/')}>Back to the wall</a></p></div>;

  return (
    <div className="page editor-page">
      <header className="bar editor-bar">
        <a className="icon-btn" href="/" onClick={linkHandler('/')} aria-label="Back to the wall"><ArrowLeft /></a>
        <h1 className="editor-title">{d?.piece.title || ' '}</h1>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'image'} onClick={() => setView('image')}>Image</button>
          <button aria-pressed={view === 'parts'} onClick={() => setView('parts')}><Pins size={14} /> Parts</button>
        </div>
        <button className="icon-btn" aria-label="Undo" title="Undo" disabled={!d?.version.parentId || busy} onClick={undo}><Undo /></button>
        {d && d.piece.status === 'ready' && (
          <PinMenu piece={{ id: d.piece.id, title: d.piece.title, src: d.piece.sm }} pinnedIn={d.piece.pinnedIn ?? []}
            onChange={(ids) => setD((p) => (p ? { ...p, piece: { ...p.piece, pinnedIn: ids } } : p))} />
        )}
        <div className="menu-wrap">
          <button className="btn" aria-haspopup="menu" aria-expanded={menu} disabled={!d || busy} onClick={() => setMenu((m) => !m)} aria-label="Export"><Download size={16} /><span className="btn-label">Export</span></button>
          {menu && (
            <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
              {exports.map((k) => <button key={k} role="menuitem" onClick={() => doExport(k)}>{EXPORT_LABEL[k]}</button>)}
            </div>
          )}
        </div>
        {d?.piece.mine && (
          <button className="icon-btn" aria-label="Delete this piece" title="Delete" disabled={busy}
            onClick={() => void deletePiece(d.piece, () => navigate('/mine'))}><Trash /></button>
        )}
      </header>

      <div className="editor">
        <section className="stage" aria-label="The piece">
          <div className={'stage-inner' + (busy ? ' busy' : '')}>
            {video && view === 'image' ? (
              <Player src={video} poster={shown?.src ?? null} w={shown?.w ?? null} h={shown?.h ?? null} />
            ) : shown ? (
              <figure className="art" style={shown.w && shown.h ? { aspectRatio: `${shown.w} / ${shown.h}` } : undefined}>
                <img key={shown.src} src={shown.src} alt={d?.piece.title || ''} decoding="async" />
                {view === 'parts' && pins?.map((p) => (
                  <button key={p.face + p.n} className="pin" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} onClick={() => addPart(p.n)} aria-label={`P${p.n} ${p.name}`}>P{p.n}</button>
                ))}
              </figure>
            ) : (
              <div className="art skeleton" style={{ aspectRatio: '592 / 914' }} />
            )}
            {busy && <div className="working" role="status"><span className="spin" aria-hidden="true" />{PHASE_TEXT[phase]}{progress != null ? ` ${Math.round(progress * 100)}%` : '…'}</div>}
            {!busy && progress != null && <div className="working quiet" role="status"><span className="spin" aria-hidden="true" />Preparing the video {Math.round(progress * 100)}%</div>}
          </div>
          {view === 'parts' && parts && (
            <ul className="parts" aria-label="Parts">
              {parts.map((p) => (
                <li key={p.face + p.n}><button onClick={() => addPart(p.n)}><b>P{p.n}</b> {p.name}{p.face && p.face !== 'front' && parts.some((q) => q.face !== p.face) ? <i> · {p.face}</i> : null}</button></li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel" aria-label="Godtongue">
          <div className="codepanel">
            <div className="panel-head">
              <span className="panel-title">Godtongue</span>
              <span className="panel-meta">{d ? `v${d.version.n}${d.version.command ? ' · ' + d.version.command : d.version.by === 'human' ? ' · edited by hand' : ''}` : ''}</span>
              <button className="run" onClick={run} disabled={!d || busy} title="Run (⌘↵)">Run <kbd>⌘↵</kbd></button>
            </div>
            <CodeBox ref={code} value={source} onChange={setSource} onRun={run} changed={changed} errors={errorLines} disabled={!d} />
            {diags.some((x) => x.level === 'error') && (
              <ul className="diags">
                {diags.filter((x) => x.level === 'error').slice(0, 6).map((x, i) => (
                  <li key={i}><button onClick={() => x.line && code.current?.goToLine(x.line)}>{x.line ? `Line ${x.line}: ` : ''}{x.msg}</button>{x.hint && <span>{x.hint}</span>}</li>
                ))}
              </ul>
            )}
            <form className="command" onSubmit={submitCommand}>
              <label className="sr-only" htmlFor="cmd">Describe a change</label>
              <input id="cmd" ref={cmdInput} value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Describe a change, like “make p1 chrome”" autoComplete="off" disabled={!d} />
              <button className="make" type="submit" disabled={!cmd.trim() || busy} aria-label="Apply the change"><Send size={16} /></button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
