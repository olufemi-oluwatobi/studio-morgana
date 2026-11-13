// The hover cards: one card that follows the pointer from word to word. It shows what a word of the language does,
// what is wrong with a word that has an error, and, for a named thing, how it came out (a crop of the picture, with
// its size, place and looks). The card is a single element: moving between words slides it; it never blinks.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tokens } from '../lib/gt-highlight';
import { unionBox, type Hit } from '../lib/inspect';
import type { Elem } from '../render/compiler';

export interface Geom { size: [number, number]; crop: [number, number, number, number] | null }
export interface Env {
  src: string | null; geom: Geom | null; stale: boolean; files: Record<string, string>;
  goTo(line: number): void; fix(d: { range?: { line: number; col: number; len: number }; fix?: { replace: string } }): void;
}
export interface Shown { key: string; hit: Hit; rect: { left: number; top: number; right: number; bottom: number } }

// ── the card's behaviour: when it opens, when it goes, where it sits ──────────────────────────────────────────────
export function useHoverCard() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(0), gone = useRef(0), lastClose = useRef(0);
  const cur = useRef<Shown | null>(null); cur.current = shown;
  const clear = () => { window.clearTimeout(timer.current); window.clearTimeout(gone.current); };
  const show = useCallback((s: Shown) => {
    window.clearTimeout(timer.current); window.clearTimeout(gone.current);
    if (cur.current?.key === s.key) { setOpen(true); return; }
    const quick = cur.current || performance.now() - lastClose.current < 500;     // already looking at one: no wait
    timer.current = window.setTimeout(() => { setShown(s); requestAnimationFrame(() => setOpen(true)); }, quick ? 70 : 260);
  }, []);
  const hide = useCallback((after = 160) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastClose.current = performance.now(); setOpen(false);
      gone.current = window.setTimeout(() => setShown(null), 160);
    }, after);
  }, []);
  const keep = useCallback(clear, []);
  useEffect(() => clear, []);
  return { shown, open, show, hide, keep };
}

export function HoverLayer({ shown, open, env, onEnter, onLeave }: { shown: Shown | null; open: boolean; env: Env; onEnter(): void; onLeave(): void }) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!shown || !el.current) return;
    const place = () => {
      const w = el.current!.offsetWidth, h = el.current!.offsetHeight, r = shown.rect, vw = window.innerWidth, vh = window.innerHeight;
      const above = r.top - 10 - h >= 8, below = !above && r.bottom + 10 + h <= vh - 8;     // above first: people read down the page, so the card stays off the next line
      const y = below ? r.bottom + 10 : above ? r.top - 10 - h : Math.max(8, Math.min(vh - h - 8, r.top));
      const x = Math.max(8, Math.min(vw - w - 8, below || above ? r.left : r.right + 12 + w > vw ? r.left - w - 12 : r.right + 12));
      setPos({ x: Math.round(x), y: Math.round(y), above });
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(el.current);
    return () => ro.disconnect();
  }, [shown]);
  if (!shown) return null;
  return createPortal(
    <div ref={el} className="hc" data-open={open && !!pos} data-above={pos?.above} role="tooltip"
      style={{ transform: `translate(${pos?.x ?? -999}px, ${pos?.y ?? -999}px)` }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="hc-in"><Body hit={shown.hit} env={env} /></div>
    </div>,
    document.body,
  );
}

// ── what a card says ──────────────────────────────────────────────────────────────────────────────────────────────
const Code = memo(function Code({ text }: { text: string }) {
  return <code className="hc-code">{tokens(text).map((t, i) => (t.k ? <span key={i} className={'t-' + t.k}>{t.t}</span> : t.t))}</code>;
});
const KIND: Record<string, string> = { verb: 'Action', effect: 'Effect', state: 'Look', transform: 'Change', motion: 'Motion', colour: 'Colour', shape: 'Shape', material: 'Material', style: 'Style', word: 'Word' };
const head = (kind: string, title: ReactNode, right?: ReactNode) => (
  <div className="hc-head"><span className={'hc-kind k-' + kind}>{KIND[kind] || kind}</span><b>{title}</b>{right && <span className="hc-right">{right}</span>}</div>
);

function Body({ hit, env }: { hit: Hit; env: Env }) {
  switch (hit.k) {
    case 'diag': {
      const d = hit.d, warn = d.level !== 'error';
      return (
        <>
          <div className="hc-head"><span className={'hc-kind ' + (warn ? 'k-warn' : 'k-err')}>{warn ? 'Warning' : d.internal ? 'Fault' : 'Error'}</span>{d.line ? <button className="hc-link" onClick={() => env.goTo(d.line!)}>line {d.line}</button> : null}</div>
          <p className="hc-msg">{d.msg.replace(/^internal: /, '')}</p>
          {d.hint && <p className="hc-hint">{d.hint}</p>}
          {d.follows ? <p className="hc-hint">This follows from <button className="hc-link" onClick={() => env.goTo(d.follows!)}>line {d.follows}</button>. Fix that first.</p> : null}
          {d.fix && <button className="hc-fix" onClick={() => env.fix(d)}>Change to “{d.fix.replace}”</button>}
        </>
      );
    }
    case 'word': return <WordBody hit={hit} />;
    case 'color': return (
      <>{head('colour', hit.hex)}<div className="hc-swatch" style={{ background: hit.hex }} /></>
    );
    case 'file': return (
      <>{head('word', '@' + hit.name)}{env.files[hit.name] ? <img className="hc-img" src={env.files[hit.name]} alt="" /> : <p className="hc-hint">A file in this piece.</p>}</>
    );
    case 'piece': return env.geom ? (
      <>{head('shape', 'The whole piece', <span>{Math.round(env.geom.size[0])} × {Math.round(env.geom.size[1])}</span>)}<Crop env={env} box={[0, 0, env.geom.size[0], env.geom.size[1]]} />{env.stale && <p className="hc-note">As of the last run.</p>}</>
    ) : head('shape', 'The piece');
    case 'elem': return <ElemBody e={hit.e} env={env} />;
    case 'set': {
      const ms = hit.members, b = unionBox(ms);
      return (
        <>
          {head('shape', `${ms.length} × ${hit.name}`, <span>{ms[0].kind}</span>)}
          <Crop env={env} box={b} boxes={ms.map((m) => m.box)} />
          <dl className="hc-facts"><dt>Together</dt><dd>{Math.round(b[2] - b[0])} × {Math.round(b[3] - b[1])}</dd><dt>Names</dt><dd>{hit.name}-1 … {hit.name}-{ms.length}</dd></dl>
          {env.stale && <p className="hc-note">As of the last run.</p>}
        </>
      );
    }
  }
}

function WordBody({ hit }: { hit: Extract<Hit, { k: 'word' }> }) {
  const { entry, kind, label } = hit;
  const ex = entry.example || entry.examples?.[0];
  const also = (entry.words || []).filter((w) => w.toLowerCase() !== label.toLowerCase()).slice(0, 6);
  const params = entry.params ? Object.entries(entry.params).slice(0, 8) : [];
  return (
    <>
      {head(kind, label, kind === 'material' && entry.type ? entry.type : undefined)}
      {entry.hex && <div className="hc-swatch" style={{ background: entry.hex }}><span>{entry.hex}</span></div>}
      {entry.help && <p className="hc-msg">{entry.help}</p>}
      {!entry.help && !entry.hex && <p className="hc-hint">{kind === 'material' ? 'A material the card can be made of.' : 'A word the language knows.'}</p>}
      {ex && <div className="hc-ex"><span>Try</span><Code text={ex} /></div>}
      {params.length > 0 && (
        <dl className="hc-facts">{params.map(([k, v]) => <FactRow key={k} k={k.replace(/_/g, ' ')} v={typeof v === 'object' ? '' : String(v)} />)}</dl>
      )}
      {also.length > 0 && <p className="hc-also">Also: {also.join(' · ')}</p>}
    </>
  );
}
const FactRow = ({ k, v }: { k: string; v: string }) => <><dt>{k}</dt><dd>{v}</dd></>;

function ElemBody({ e, env }: { e: Elem; env: Env }) {
  const [x0, y0, x1, y1] = e.box;
  return (
    <>
      {head('shape', e.name, e.line ? <button className="hc-link" onClick={() => env.goTo(e.line!)}>line {e.line}</button> : undefined)}
      <Crop env={env} box={e.box} />
      <dl className="hc-facts">
        <FactRow k="Is" v={e.kind} />
        <FactRow k="Size" v={`${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`} />
        <FactRow k="Centre" v={`${Math.round((x0 + x1) / 2)}, ${Math.round((y0 + y1) / 2)}`} />
        {e.text != null && <FactRow k="Says" v={`“${e.text.length > 40 ? e.text.slice(0, 40) + '…' : e.text}”`} />}
        {e.font && <FactRow k="Type" v={`${e.font}${e.size ? ', ' + Math.round(e.size) : ''}`} />}
        {e.fill && <><dt>Fill</dt><dd><i className="hc-dot" style={{ background: e.fill }} />{/^#/.test(e.fill) ? e.fill : 'gradient'}</dd></>}
      </dl>
      {e.looks.length > 0 && <ul className="hc-looks">{e.looks.slice(0, 8).map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {env.stale && <p className="hc-note">As of the last run.</p>}
    </>
  );
}

// a crop of the picture around a box, with the box marked: the thing as it came out
function Crop({ env, box, boxes }: { env: Env; box: [number, number, number, number]; boxes?: [number, number, number, number][] }) {
  const g = env.geom;
  if (!env.src || !g) return null;
  const [cx0, cy0, cx1, cy1] = g.crop ?? [0, 0, g.size[0], g.size[1]];
  const cw = cx1 - cx0, ch = cy1 - cy0;
  const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
  const pad = Math.max(24, Math.max(bw, bh) * 0.12);
  const px0 = box[0] - pad, py0 = box[1] - pad, pw = bw + pad * 2, ph = bh + pad * 2;
  const k = Math.min(296 / pw, 168 / ph);               // preview pixels per piece pixel
  const W = pw * k, H = ph * k;
  const mark = (b: number[], i?: number) => <span key={i} className="hc-box" style={{ left: (b[0] - px0) * k, top: (b[1] - py0) * k, width: (b[2] - b[0]) * k, height: (b[3] - b[1]) * k }} />;
  return (
    <div className="hc-crop" style={{ width: W, height: H }}>
      <div className="hc-crop-img" style={{ backgroundImage: `url("${env.src}")`, backgroundSize: `${cw * k}px ${ch * k}px`, backgroundPosition: `${-(px0 - cx0) * k}px ${-(py0 - cy0) * k}px` }} />
      {boxes ? boxes.map((b, i) => mark(b, i)) : mark(box)}
    </div>
  );
}
