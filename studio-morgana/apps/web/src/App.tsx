import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parse, useLocation } from './lib/router';
import { loadMe } from './lib/session';
import { warmCompiler } from './render/compiler';
import { Sidebar } from './components/Sidebar';
import { DragTray, Toasts } from './components/Overlays';
import Wall from './pages/Wall';

const Editor = lazy(() => import('./pages/Editor'));
const Auth = lazy(() => import('./pages/Auth'));
const Lab = lazy(() => import('./pages/Lab'));

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

  if (route.name === 'auth') return <ErrorBoundary><Suspense fallback={null}><Auth mode={route.mode} token={route.token} /><Toasts /></Suspense></ErrorBoundary>;
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <ErrorBoundary key={route.name === 'editor' ? route.id : route.name}>
          {route.name === 'wall' ? <Wall scope={route.scope} /> : route.name === 'lab' ? <Suspense fallback={null}><Lab /></Suspense> : <Suspense fallback={<div className="page editor-page" aria-busy="true"><div className="art skeleton" style={{ aspectRatio: '592 / 914', maxWidth: 520, margin: '72px auto' }} /></div>}><Editor id={route.id} /></Suspense>}
        </ErrorBoundary>
      </div>
      <DragTray />
      <Toasts />
    </div>
  );
}
