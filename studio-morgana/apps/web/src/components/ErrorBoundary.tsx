// A page that throws must not leave a white screen: say so calmly and offer the way out. The detail goes to the console.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('page crashed:', error); }
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
