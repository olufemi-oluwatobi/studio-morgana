// Who is here, the theme, and toasts.
import { api, type Me } from './api';
import { createStore } from './store';

export const meStore = createStore<Me | null>(null);
export async function loadMe(): Promise<Me> {
  const me = await api<Me>('/me');
  meStore.set(me);
  return me;
}

export type Theme = 'light' | 'dark';
const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const stored = (): Theme | null => { try { const t = localStorage.getItem('morgana-theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; } };
export const themeStore = createStore<Theme>(typeof window === 'undefined' ? 'dark' : stored() ?? systemTheme());
export function toggleTheme() {
  const t: Theme = themeStore.get() === 'light' ? 'dark' : 'light';
  themeStore.set(t);
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('morgana-theme', t); } catch { /* private window */ }
}

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
export const toastStore = createStore<Toast[]>([]);
let tid = 0;
export function toast(text: string, action?: Toast['action'], ms = 5000): void {
  const t = { id: ++tid, text, action };
  toastStore.set((xs) => [...xs.slice(-2), t]);
  setTimeout(() => toastStore.set((xs) => xs.filter((x) => x.id !== t.id)), ms);
}
export function dismissToast(id: number) { toastStore.set((xs) => xs.filter((x) => x.id !== id)); }
