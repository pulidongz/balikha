'use client';

import { useSyncExternalStore } from 'react';

// useSyncExternalStore-based hydration gate: server snapshot returns false,
// client snapshot returns true. SSR and the first client render agree (both
// see false → plain element), then React re-renders with true → animated
// element. No useEffect + setState, no hydration mismatch.
function subscribe(): () => void {
  return () => {};
}
function getSnapshot(): boolean {
  return true;
}
function getServerSnapshot(): boolean {
  return false;
}

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
