// While a piece is dragged: a tray with Remove, New card (use it as a reference) and Edit. And the toasts.
import { memo, useEffect, useState, type DragEvent } from 'react';
import { useStore } from '../lib/store';
import { addPieceRef, dragStore, removeTile, type Tile } from '../lib/wall';
import { dismissToast, toastStore } from '../lib/session';
import { navigate } from '../lib/router';
import { Pencil, Sparkle, Trash } from './Icons';

type Zone = 'remove' | 'new' | 'edit';
const ZONES: { id: Zone; label: string; Icon: typeof Trash }[] = [
  { id: 'remove', label: 'Remove', Icon: Trash }, { id: 'new', label: 'New card', Icon: Sparkle }, { id: 'edit', label: 'Edit', Icon: Pencil },
];

function act(zone: Zone, t: Tile) {
  if (!t.id) return;
  if (zone === 'remove') void removeTile(t);
  else if (zone === 'new') addPieceRef({ id: t.id, title: t.title, thumb: t.src });
  else navigate('/p/' + t.id);
}

export const DragTray = memo(function DragTray() {
  const t = useStore(dragStore, (d) => d);
  const [hot, setHot] = useState<Zone | null>(null);

  // dropped outside the window (or nowhere that takes it): put it away
  useEffect(() => {
    if (!t) { setHot(null); return; }
    let dropped = false;
    const onDrop = () => { dropped = true; };
    const onEnd = (e: globalThis.DragEvent) => {
      const out = (e.screenX || e.screenY) && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight);
      if (!dropped && out && e.dataTransfer?.dropEffect === 'none') act('remove', t);
      dragStore.set(null);
    };
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', onEnd, true);
    return () => { document.removeEventListener('drop', onDrop, true); document.removeEventListener('dragend', onEnd, true); };
  }, [t]);

  if (!t) return null;
  const zoneProps = (z: Zone) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = z === 'remove' ? 'move' : 'copy'; },
    onDragEnter: (e: DragEvent) => { e.preventDefault(); setHot(z); },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setHot((h) => (h === z ? null : h)); },
    onDrop: (e: DragEvent) => { e.preventDefault(); act(z, t); dragStore.set(null); },
  });
  return (
    <div className="tray" role="group" aria-label="Drop the piece on an action">
      {ZONES.map(({ id, label, Icon }) => (
        <div key={id} className={'zone' + (hot === id ? ' hot' : '')} {...zoneProps(id)}><Icon size={22} /><span>{label}</span></div>
      ))}
    </div>
  );
});

export const Toasts = memo(function Toasts() {
  const ts = useStore(toastStore, (x) => x);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {ts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button onClick={() => { dismissToast(t.id); t.action!.run(); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
});
