import { lazy, Suspense, useEffect } from 'react';
import { parse, useLocation } from './lib/router';
import { loadMe } from './lib/session';
import { warmCompiler } from './render/compiler';
import { Sidebar } from './components/Sidebar';
import { DragTray, Toasts } from './components/Overlays';
import Wall from './pages/Wall';

const Editor = lazy(() => import('./pages/Editor'));
const Auth = lazy(() => import('./pages/Auth'));

export default function App() {
  const route = parse(useLocation());
  useEffect(() => {
    void loadMe().catch(() => { /* shown as signed out */ });
    // fonts and the compiler load in the background once the page is idle
    const idle = (window as any).requestIdleCallback as ((f: () => void, o?: { timeout: number }) => number) | undefined;
    const h = idle ? idle(warmCompiler, { timeout: 2500 }) : window.setTimeout(warmCompiler, 1200);
    return () => { if (idle) (window as any).cancelIdleCallback(h); else clearTimeout(h); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [route.name, route.name === 'editor' ? route.id : '']);

  if (route.name === 'auth') return <Suspense fallback={null}><Auth mode={route.mode} token={route.token} /><Toasts /></Suspense>;
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {route.name === 'wall' ? <Wall /> : <Suspense fallback={<div className="page" />}><Editor id={route.id} /></Suspense>}
      </div>
      <DragTray />
      <Toasts />
    </div>
  );
}
