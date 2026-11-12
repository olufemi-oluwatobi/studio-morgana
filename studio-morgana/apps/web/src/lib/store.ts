// A tiny external store: components subscribe to a slice and re-render only when that slice changes.
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const v = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(v, state)) return;
      state = v;
      subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

// the selector must return something stable (a stored object, a primitive), never a fresh object per call
export function useStore<T, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
