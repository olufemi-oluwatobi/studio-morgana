// The wall: shortest-column masonry, laid out once per (items, width), placed with transforms.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { dragStore, type Tile } from '../lib/wall';
import { linkHandler } from '../lib/router';
import { watchPreview } from './previews';

const GAP = 6;
const columnsFor = (w: number) => (w < 560 ? 2 : w < 900 ? 3 : w < 1280 ? 4 : w < 1700 ? 5 : 6);
const DEFAULT_RATIO = 914 / 592; // a card, until the real shape is known

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    let raf = 0;
    const ro = new ResizeObserver(([e]) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setW(Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ref]);
  return w;
}

const TileView = memo(function TileView({ t, x, y, w, h }: { t: Tile; x: number; y: number; w: number; h: number }) {
  const img = useRef<HTMLImageElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => (vid.current && t.video ? watchPreview(vid.current) : undefined), [t.video]);
  // mark loaded on the element itself: no state, no re-render
  useEffect(() => {
    const i = img.current; if (!i) return;
    const done = () => i.classList.add('loaded');
    if (i.complete && i.naturalWidth) done(); else i.addEventListener('load', done, { once: true });
    return () => i.removeEventListener('load', done);
  }, [t.src]);

  const ready = t.state === 'ready' && t.id;
  const onDragStart = (e: DragEvent) => {
    if (!t.id) return e.preventDefault();
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-morgana-piece', JSON.stringify({ id: t.id, title: t.title, thumb: t.src }));
    e.dataTransfer.setData('text/uri-list', location.origin + '/p/' + t.id);
    dragStore.set(t);
  };
  const style = { width: w, height: h, transform: `translate3d(${x}px, ${y}px, 0)` };
  const body = (
    <>
      {t.src && <img ref={img} src={t.src} alt={t.title} width={t.w ?? undefined} height={t.h ?? undefined} decoding="async" loading="lazy" draggable={false} />}
      {t.video && <video ref={vid} data-src={t.video} muted loop playsInline preload="none" poster={t.src ?? undefined} aria-hidden="true" />}
      {t.state !== 'ready' && (
        <span className={'tile-state ' + t.state}>
          <span className="tile-label">{t.state === 'writing' ? 'Writing' : t.state === 'rendering' ? 'Rendering' : 'Did not work'}</span>
        </span>
      )}
    </>
  );
  return ready ? (
    <a className="tile" style={style} href={'/p/' + t.id} onClick={linkHandler('/p/' + t.id)} draggable onDragStart={onDragStart}
      onDragEnd={() => dragStore.set(null)} aria-label={t.title}>{body}</a>
  ) : (
    <div className={'tile' + (t.src ? '' : ' skeleton')} style={style} aria-label={t.state === 'failed' ? 'Did not work' : 'Making'} role="img">{body}</div>
  );
});

export const Masonry = memo(function Masonry({ items, onEnd }: { items: Tile[]; onEnd?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const [animate, setAnimate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimate(true), 400); return () => clearTimeout(t); }, []);

  const layout = useMemo(() => {
    if (!width) return { pos: [] as { x: number; y: number; w: number; h: number }[], height: 0 };
    const cols = columnsFor(width), cw = (width - GAP * (cols - 1)) / cols;
    const hs = new Array(cols).fill(0);
    const pos = items.map((t) => {
      const ratio = t.w && t.h ? t.h / t.w : DEFAULT_RATIO;
      let c = 0; for (let i = 1; i < cols; i++) if (hs[i] < hs[c] - 1) c = i;
      const p = { x: c * (cw + GAP), y: hs[c], w: cw, h: Math.round(cw * ratio) };
      hs[c] += p.h + GAP;
      return p;
    });
    return { pos, height: Math.max(0, ...hs) };
  }, [items, width]);

  // load more when the end comes near
  useEffect(() => {
    const el = end.current; if (!el || !onEnd) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) onEnd(); }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [onEnd]);

  return (
    <div ref={box} className={'masonry' + (animate ? ' animate' : '')} style={{ height: layout.height }}>
      {width > 0 && items.map((t, i) => <TileView key={t.key} t={t} {...layout.pos[i]} />)}
      <div ref={end} className="masonry-end" style={{ transform: `translateY(${layout.height}px)` }} />
    </div>
  );
});
