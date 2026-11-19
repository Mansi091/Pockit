import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/database/db';
import { getMeta, META, setMeta } from '@/database/metaRepository';
import { deleteImage, imageExists } from '@/services/imageService';
import { emitContactsChanged } from '@/services/dataEvents';
import { syncAll } from '@/sync/engine';
import { SYNC_TABLES } from '@/sync/tables';
import { countPending, sqliteLocalStore } from '@/sync/sqliteLocalStore';
import { supabaseRemoteStore } from '@/sync/supabaseRemoteStore';

/**
 * Offline-first cloud backup & sync — orchestration only.
 * The actual pull/push rules live in src/sync/engine.ts and apply to every
 * table in src/sync/tables.ts (contacts + all v2 tables). Public API is
 * unchanged from P6, so screens and AuthProvider need no changes.
 */
export type SyncState = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';
interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pending: number;
  error: string | null;
}

let status: SyncStatus = { state: 'disabled', lastSyncedAt: null, pending: 0, error: null };
const listeners = new Set<(s: SyncStatus) => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

const pendingCount = () => countPending(SYNC_TABLES);

export async function isBackupEnabled(): Promise<boolean> {
  return (await getMeta(META.backupEnabled)) === '1';
}

/** Call once after the user's database opens. */
export async function initSync(): Promise<void> {
  const enabled = await isBackupEnabled();
  setStatus({
    state: enabled ? 'idle' : 'disabled',
    lastSyncedAt: await getMeta(META.lastSyncedAt),
    pending: await pendingCount(),
    error: null,
  });
  if (enabled) requestSync(0);
}

export function resetSyncStatus() {
  if (timer) clearTimeout(timer);
  timer = null;
  setStatus({ state: 'disabled', lastSyncedAt: null, pending: 0, error: null });
}

export async function setBackupEnabled(enabled: boolean): Promise<void> {
  await setMeta(META.backupEnabled, enabled ? '1' : '0');
  setStatus({ state: enabled ? 'idle' : 'disabled', error: null });
  if (enabled) await syncNow();
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Debounced background sync after local edits. No-op when backup is off. */
export function requestSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    isBackupEnabled()
      .then((on) => (on ? syncNow() : undefined))
      .catch(() => undefined);
  }, delayMs);
}

let inFlight: Promise<void> | null = null;
let again = false;

/** Runs a full sync. Concurrent calls are coalesced into one extra run. */
export function syncNow(): Promise<void> {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runOnce(): Promise<void> {
  if (!supabase) return;
  if (!(await isBackupEnabled())) {
    setStatus({ state: 'disabled' });
    return;
  }
  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected || net.isInternetReachable === false) {
    setStatus({ state: 'offline', pending: await pendingCount() });
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = getCurrentUserId();
  if (!sessionData.session || sessionData.session.user.id !== userId) return;

  setStatus({ state: 'syncing', error: null });
  try {
    const { pulled, pushed } = await syncAll(SYNC_TABLES, {
      local: sqliteLocalStore,
      remote: supabaseRemoteStore(supabase, userId),
      files: { exists: imageExists, remove: deleteImage },
      userId,
    });
    const now = new Date().toISOString();
    await setMeta(META.lastSyncedAt, now);
    setStatus({ state: 'idle', lastSyncedAt: now, pending: await pendingCount() });
    if (pulled || pushed) emitContactsChanged();
  } catch (e) {
    setStatus({
      state: 'error',
      error: e instanceof Error ? e.message : 'Sync failed',
      pending: await pendingCount().catch(() => status.pending),
    });
  }
}
