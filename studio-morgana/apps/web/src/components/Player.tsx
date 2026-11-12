// The motion player: the piece's video with a quiet bar (play, scrub, time). The bar updates from the video's own
// frame callback while playing, never through React state, so playing costs no renders.
import { memo, useEffect, useRef, useState } from 'react';
import { Pause, Play } from './Icons';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const Player = memo(function Player({ src, poster, w, h }: { src: string; poster: string | null; w: number | null; h: number | null }) {
  const v = useRef<HTMLVideoElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = v.current; if (!el) return;
    let handle = 0, stop = false;
    const paint = () => {
      if (range.current && el.duration) range.current.value = String((el.currentTime / el.duration) * 1000);
      if (time.current) time.current.textContent = `${fmt(el.currentTime)} / ${fmt(el.duration || 0)}`;
    };
    const tick = () => {
      if (stop) return;
      paint();
      if ('requestVideoFrameCallback' in el) handle = (el as any).requestVideoFrameCallback(tick);
      else handle = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); stop = false; tick(); };
    const onPause = () => { setPlaying(false); stop = true; paint(); };
    el.addEventListener('play', onPlay); el.addEventListener('pause', onPause); el.addEventListener('loadedmetadata', paint);
    el.play().catch(() => { /* needs a tap */ });
    return () => {
      stop = true;
      if ('cancelVideoFrameCallback' in el) (el as any).cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle);
      el.removeEventListener('play', onPlay); el.removeEventListener('pause', onPause); el.removeEventListener('loadedmetadata', paint);
      el.pause(); el.removeAttribute('src'); el.load();
    };
  }, [src]);

  const toggle = () => { const el = v.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); };
  return (
    <figure className="player" style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined}>
      <video ref={v} src={src} poster={poster ?? undefined} muted loop playsInline onClick={toggle} />
      <div className="player-bar">
        <button className="icon-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <input ref={range} type="range" min={0} max={1000} defaultValue={0} aria-label="Position"
          onInput={(e) => { const el = v.current; if (el?.duration) el.currentTime = (Number(e.currentTarget.value) / 1000) * el.duration; }} />
        <span ref={time} className="player-time">0:00 / 0:00</span>
      </div>
    </figure>
  );
});
