// One IntersectionObserver for every video preview on the page. At most a couple play at once (the most visible);
// a video gets its source only when it comes near the screen, and gives it up again when it leaves.
const MAX = () => (innerWidth < 700 ? 1 : 2);
const ratios = new Map<HTMLVideoElement, number>();
let io: IntersectionObserver | null = null;
let near: IntersectionObserver | null = null;

function settle() {
  const ranked = [...ratios.entries()].filter(([, r]) => r >= 0.55).sort((a, b) => b[1] - a[1]).slice(0, MAX()).map(([v]) => v);
  for (const v of ratios.keys()) {
    if (ranked.includes(v)) { if (v.paused && v.src) v.play().then(() => v.classList.add('on')).catch(() => { /* autoplay refused: the poster stays */ }); }
    else if (!v.paused) { v.pause(); v.classList.remove('on'); }
  }
}

function observers() {
  if (!io) {
    io = new IntersectionObserver((es) => { for (const e of es) ratios.set(e.target as HTMLVideoElement, e.intersectionRatio); settle(); }, { threshold: [0, 0.25, 0.55, 0.8, 1] });
    near = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) { if (!v.src && v.dataset.src) { v.src = v.dataset.src; } }
        else if (v.src) { v.pause(); v.classList.remove('on'); v.removeAttribute('src'); v.load(); }
      }
      settle(); // a video that just got its source may be the one to play
    }, { rootMargin: '300px 0px' });
  }
  return { io: io!, near: near! };
}

export function watchPreview(v: HTMLVideoElement): () => void {
  const o = observers();
  ratios.set(v, 0);
  o.io.observe(v); o.near.observe(v);
  return () => {
    o.io.unobserve(v); o.near.unobserve(v);
    ratios.delete(v);
    v.pause(); v.removeAttribute('src'); v.load();
  };
}
