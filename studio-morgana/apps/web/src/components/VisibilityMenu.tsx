// "Public / Private" in the editor: public pieces can be seen, pinned and remixed by anyone, and are considered for the showcase.
import { memo, useEffect, useRef, useState } from 'react';
import { api, type Visibility } from '../lib/api';
import { meStore, toast } from '../lib/session';
import { useStore } from '../lib/store';
import { patchPiece } from '../lib/wall';
import { linkHandler } from '../lib/router';
import { Check, Globe, Lock } from './Icons';

export const VisibilityMenu = memo(function VisibilityMenu({ id, value, ready, onChange }: { id: string; value: Visibility; ready: boolean; onChange(v: Visibility): void }) {
  const signedIn = useStore(meStore, (m) => !!m?.user);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const set = async (v: Visibility) => {
    setOpen(false);
    if (v === value) return;
    try {
      await api(`/pieces/${id}/visibility`, { body: { visibility: v } });
      onChange(v); patchPiece(id, { visibility: v });
      toast(v === 'public' ? 'Public: anyone can see this piece, and it can be picked for the showcase' : 'Private: only you can see this piece');
    } catch (e) { toast((e as Error).message); }
  };
  const canPublic = signedIn && ready;
  return (
    <div className="menu-wrap" ref={box}>
      <button className={'btn' + (value === 'public' ? ' pinned' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={value === 'public' ? 'Public' : 'Private'}>
        {value === 'public' ? <Globe size={16} /> : <Lock size={16} />}<span className="btn-label">{value === 'public' ? 'Public' : 'Private'}</span>
      </button>
      {open && (
        <div className="menu vis-menu" role="menu" aria-label="Who can see this piece">
          <div className="menu-label">Who can see this piece</div>
          <button role="menuitemradio" aria-checked={value === 'private'} onClick={() => void set('private')}>
            <span className={'check' + (value === 'private' ? ' on' : '')}>{value === 'private' && <Check size={12} />}</span>
            <span className="menu-text"><b>Private</b><small>Only you</small></span>
          </button>
          <button role="menuitemradio" aria-checked={value === 'public'} disabled={!canPublic} onClick={() => void set('public')}>
            <span className={'check' + (value === 'public' ? ' on' : '')}>{value === 'public' && <Check size={12} />}</span>
            <span className="menu-text"><b>Public</b><small>Anyone can see, pin and remix it</small></span>
          </button>
          {!signedIn && <div className="menu-empty"><a href="/auth" onClick={linkHandler('/auth')}>Sign in</a> to make a piece public</div>}
          {signedIn && !ready && <div className="menu-empty">Finish rendering first</div>}
        </div>
      )}
    </div>
  );
});
