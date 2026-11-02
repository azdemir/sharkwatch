// The video's current footage time, shared with the patrol timeline without re-rendering the app.

import { useSyncExternalStore } from 'react';

let seconds = 0;
const listeners = new Set<() => void>();

/** Called by the drone feed; listeners hear at most one update per 100 ms of footage. */
export function publishPlayhead(t: number): void {
  if (Math.abs(t - seconds) < 0.1 && t !== 0) return;
  seconds = t;
  for (const l of listeners) l();
}

export function usePlayhead(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => seconds,
  );
}
