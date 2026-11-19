import { useEffect, useState } from 'react';

/**
 * Tiny pub/sub so screens refresh when contacts change from anywhere
 * (a save on another screen, or a background cloud sync).
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function emitContactsChanged() {
  version += 1;
  listeners.forEach((l) => l());
}

export function onContactsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns a number that increments on every change — use it as an effect dependency. */
export function useContactsVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => onContactsChanged(() => setV(version)), []);
  return v;
}
