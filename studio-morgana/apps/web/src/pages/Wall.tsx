// Page 1: the wall. Fixed header (composer + category tabs), then your pieces and the featured collection.
import { memo, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../lib/store';
import { TABS, draftsStore, hiddenStore, loadWall, wallStore, type Tab, type Tile } from '../lib/wall';
import { Composer } from '../components/Composer';
import { Masonry } from '../components/Masonry';
import { drawerStore } from '../components/Sidebar';
import { Menu } from '../components/Icons';

const Tabs = memo(function Tabs() {
  const tab = useStore(wallStore, (w) => w.tab);
  return (
    <div className="tabs" role="tablist" aria-label="Kinds of piece">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')}
          onClick={() => { if (t.id !== tab) void loadWall({ tab: t.id as Tab }); }}>{t.label}</button>
      ))}
    </div>
  );
});

export default function Wall() {
  const mine = useStore(wallStore, (w) => w.mine);
  const featured = useStore(wallStore, (w) => w.featured);
  const tab = useStore(wallStore, (w) => w.tab);
  const view = useStore(wallStore, (w) => w.view);
  const loading = useStore(wallStore, (w) => w.loading);
  const error = useStore(wallStore, (w) => w.error);
  const hasMore = useStore(wallStore, (w) => w.next != null);
  const drafts = useStore(draftsStore, (d) => d);
  const hidden = useStore(hiddenStore, (h) => h);

  useEffect(() => { void loadWall(); }, []);

  const items = useMemo<Tile[]>(() => {
    const fits = (t: Tile) => tab === 'all' || t.category === tab || (t.category == null && t.state !== 'ready');
    const seen = new Set<string>();
    const out: Tile[] = [];
    const add = (t: Tile) => { const k = t.id ?? t.key; if (seen.has(k) || (t.id && hidden.has(t.id)) || !fits(t)) return; seen.add(k); out.push(t); };
    drafts.forEach(add);
    mine.forEach(add);
    if (view === 'all') featured.forEach(add);
    return out;
  }, [drafts, mine, featured, tab, view, hidden]);

  const more = useCallback(() => { if (view === 'all') void loadWall({ more: true }); }, [view]);

  return (
    <div className="page wall-page">
      <header className="bar">
        <div className="bar-row">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => drawerStore.set(true)}><Menu /></button>
          <Composer />
        </div>
        <Tabs />
      </header>
      <main className="wall">
        {error && <p className="note">Could not load the wall: {error}</p>}
        {!items.length && !loading && !error && (
          <p className="note">{view === 'mine' ? 'Nothing here yet. Describe a piece above and press Make.' : 'Nothing in this tab yet.'}</p>
        )}
        <Masonry items={items} onEnd={hasMore ? more : undefined} />
      </main>
    </div>
  );
}
