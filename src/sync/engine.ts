import type { FileAccess, LocalStore, RemoteStore, Row, TableSpec } from '@/sync/types';

/**
 * Generic offline-first sync engine (same rules P6 used for contacts, now for every table):
 *
 *  PULL  each table in parent→child order, rows with server_updated_at > cursor.
 *        Last-write-wins on `updated_at`: a local row with unpushed edits that are
 *        at least as new is kept (it gets pushed next). Rows identical to what we
 *        already have are skipped.
 *  PUSH  each table in parent→child order (cloud foreign keys never fail).
 *        Images are uploaded before the row that references them.
 *  PURGE tombstones the cloud has acknowledged, child→parent.
 */
const PAGE = 500;
const CHUNK = 200;

/** Compare timestamps as instants: Postgres returns "…+00:00", the app writes "…Z". */
export const ts = (v: unknown): number => (typeof v === 'string' && v ? Date.parse(v) : 0);

export function normaliseTimestamp(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? v : new Date(n).toISOString();
}

/** Converts a cloud row into local column values (booleans → 0/1, timestamps → ISO "Z"). */
export function remoteToLocal(spec: TableSpec, remote: Row): Row {
  const out: Row = { id: remote.id };
  for (const c of spec.columns) {
    let v = remote[c] ?? null;
    if (spec.booleans?.includes(c)) v = v ? 1 : 0;
    if (spec.timestamps?.includes(c)) v = normaliseTimestamp(v);
    out[c] = v;
  }
  return out;
}

/** Converts a local row into the cloud payload (0/1 → booleans). */
export function localToRemote(spec: TableSpec, local: Row, userId: string): Row {
  const out: Row = { id: local.id, user_id: userId };
  for (const c of spec.columns) {
    let v = local[c] ?? null;
    if (spec.booleans?.includes(c)) v = !!v;
    out[c] = v;
  }
  return out;
}

/** The P6 conflict rule, unchanged: keep local only if it has unpushed edits at least as new. */
export function localWins(local: Row | null, remote: Row): boolean {
  return !!local && local.needs_push === 1 && ts(local.updated_at) >= ts(remote.updated_at);
}

export function isAlreadyCurrent(spec: TableSpec, local: Row | null, remote: Row, files: FileAccess): boolean {
  if (!local || local.needs_push !== 0) return false;
  if (ts(local.updated_at) !== ts(remote.updated_at)) return false;
  if (ts(local.deleted_at) !== ts(remote.deleted_at)) return false;
  for (const img of spec.images ?? []) {
    const remotePath = (remote[img.column] as string | null) ?? null;
    if ((local[img.remoteColumn] ?? null) !== remotePath) return false;
    if (remotePath && !files.exists(local[img.column] as string | null)) return false;
  }
  return true;
}

export interface SyncDeps {
  local: LocalStore;
  remote: RemoteStore;
  files: FileAccess;
  userId: string;
}

async function applyRemoteRow(spec: TableSpec, r: Row, existing: Row | null, deps: SyncDeps) {
  const row = remoteToLocal(spec, r);
  for (const img of spec.images ?? []) {
    const remotePath = (r[img.column] as string | null) ?? null;
    const localUri = (existing?.[img.column] as string | null) ?? null;
    let nextLocal: string | null = null;
    if (r.deleted_at || !remotePath) {
      deps.files.remove(localUri);
    } else if (existing?.[img.remoteColumn] === remotePath && deps.files.exists(localUri)) {
      nextLocal = localUri;
    } else {
      nextLocal = await deps.remote.downloadImage(remotePath, r.id, img.suffix);
    }
    row[img.column] = nextLocal;
    row[img.remoteColumn] = remotePath;
  }
  await deps.local.applyRemote(spec, row);
}

export async function pullTable(spec: TableSpec, deps: SyncDeps): Promise<number> {
  let cursor = (await deps.local.getCursor(spec.name)) ?? '1970-01-01T00:00:00Z';
  let applied = 0;
  for (;;) {
    const rows = await deps.remote.pull(spec.name, cursor, PAGE);
    for (const r of rows) {
      const existing = await deps.local.findRow(spec.name, r.id);
      if (localWins(existing, r) || isAlreadyCurrent(spec, existing, r, deps.files)) continue;
      await applyRemoteRow(spec, r, existing, deps);
      applied += 1;
    }
    if (rows.length) {
      cursor = rows[rows.length - 1]!.server_updated_at;
      await deps.local.setCursor(spec.name, cursor);
    }
    if (rows.length < PAGE) break;
  }
  return applied;
}

export async function pushTable(spec: TableSpec, deps: SyncDeps): Promise<number> {
  const rows = await deps.local.pendingRows(spec);
  if (!rows.length) return 0;

  const payload: Row[] = [];
  const results: { row: Row; patch: Record<string, unknown>; cleared: string[] }[] = [];

  for (const row of rows) {
    const remoteRow = localToRemote(spec, row, deps.userId);
    const patch: Record<string, unknown> = {};
    const cleared: string[] = [];

    for (const img of spec.images ?? []) {
      let remotePath = (row[img.remoteColumn] as string | null) ?? null;
      const localUri = (row[img.column] as string | null) ?? null;
      const storagePath = `${deps.userId}/${row.id}${img.suffix}.jpg`;

      if (row.deleted_at || !localUri) {
        // Row deleted or image removed → remove the cloud copy too.
        if (remotePath && (await deps.remote.removeImage(remotePath))) remotePath = null;
        cleared.push(img.flag);
      } else if (row[img.flag] === 1 || !remotePath) {
        if (deps.files.exists(localUri)) {
          if (await deps.remote.uploadImage(storagePath, localUri)) {
            remotePath = storagePath;
            cleared.push(img.flag);
          } // else: keep the flag; row data still syncs, image retried next time
        } else {
          remotePath = null; // local file vanished; don't point at a stale cloud image
          cleared.push(img.flag);
        }
      } else {
        cleared.push(img.flag);
      }
      remoteRow[img.column] = remotePath;
      patch[img.remoteColumn] = remotePath;
    }

    payload.push(remoteRow);
    results.push({ row, patch, cleared });
  }

  for (let i = 0; i < payload.length; i += CHUNK) {
    await deps.remote.upsert(spec.name, payload.slice(i, i + CHUNK));
  }
  for (const { row, patch, cleared } of results) {
    await deps.local.markPushed(spec, row.id, row.updated_at as string, patch, cleared);
  }
  return rows.length;
}

/** One full sync across all tables. `specs` must be ordered parent → child. */
export async function syncAll(specs: readonly TableSpec[], deps: SyncDeps): Promise<{ pulled: number; pushed: number }> {
  let pulled = 0;
  let pushed = 0;
  for (const spec of specs) pulled += await pullTable(spec, deps);
  for (const spec of specs) pushed += await pushTable(spec, deps);
  for (const spec of [...specs].reverse()) await deps.local.purgeTombstones(spec.name);
  return { pulled, pushed };
}
