// Two pages and the account screens: / (wall), /p/:id (editor), /auth/... (sign in and friends).
import { useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === location.pathname + location.search) return;
  if (opts.replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  emit();
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export function useLocation(): string {
  return useSyncExternalStore(subscribe, () => location.pathname + location.search, () => '/');
}

export type Route =
  | { name: 'wall' }
  | { name: 'editor'; id: string }
  | { name: 'auth'; mode: 'signin' | 'signup' | 'forgot' | 'reset' | 'verify'; token: string | null };

export function parse(loc: string): Route {
  const u = new URL(loc, 'http://x');
  const m = u.pathname.match(/^\/p\/([a-z0-9]{8,40})\/?$/);
  if (m) return { name: 'editor', id: m[1] };
  const a = u.pathname.match(/^\/auth(?:\/(signin|signup|forgot|reset|verify))?\/?$/);
  if (a) return { name: 'auth', mode: (a[1] as 'signin') || 'signin', token: u.searchParams.get('token') };
  return { name: 'wall' };
}

// a plain link that navigates without reloading (and still opens in a new tab with ⌘/ctrl-click)
export function linkHandler(to: string) {
  return (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
}
