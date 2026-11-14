// A page that throws must not leave a white screen: say so calmly and offer the way out. The detail goes to the server's
// log (so a crash can be found) and the console.
import { Component, type ReactNode } from 'react';

// a page left open across a deploy asks for scripts that no longer exist; a fresh load fixes that without the person noticing
const STALE = /dynamically imported module|importing a module script|Loading chunk|Failed to fetch dynamically|error loading dynamically/i;

function report(error: unknown, where: string) {
  try {
    const e = error as Error;
    void fetch('/api/client-error', {
      method: 'POST', keepalive: true, headers: { 'x-morgana': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ message: String(e?.message ?? e).slice(0, 500), stack: String(e?.stack ?? '').slice(0, 1500), path: location.pathname, where }),
    }).catch(() => { });
  } catch { /* reporting must never throw */ }
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error('page crashed:', error);
    report(error, 'render');
    try {
      if (STALE.test(String((error as Error)?.message ?? error)) && !sessionStorage.getItem('reloaded-for-update')) {
        sessionStorage.setItem('reloaded-for-update', '1');
        location.reload();
      }
    } catch { /* no storage: the person can press Reload */ }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page"><div className="empty" role="alert">
        <h2>Something went wrong</h2>
        <p>The page hit a problem. Your pieces are safe.</p>
        <p><button className="btn" onClick={() => window.location.reload()}>Reload</button> <a className="link" href="/">Back to the wall</a></p>
      </div></div>
    );
  }
}

// errors that React does not catch (events, promises) go to the log too
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => report(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', (e) => report(e.reason, 'promise'));
}
