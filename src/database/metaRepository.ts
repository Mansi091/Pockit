import { getDb } from '@/database/db';

/** Small key/value store inside the user's database (sync cursor, preferences). */
export async function getMeta(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  await getDb().runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export const META = {
  backupEnabled: 'backup_enabled', // '1' | '0'
  lastPulledAt: 'last_pulled_at', // server timestamp cursor
  lastSyncedAt: 'last_synced_at', // device time of last successful sync (for display)
} as const;
