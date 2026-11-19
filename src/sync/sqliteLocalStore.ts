import { getDb } from '@/database/db';
import { getMeta, META, setMeta } from '@/database/metaRepository';
import type { LocalStore, Row, TableSpec } from '@/sync/types';

/**
 * LocalStore backed by the signed-in user's SQLite database.
 * Table and column names come only from SYNC_TABLES constants (never user input),
 * so interpolating them into SQL is safe; all values are bound parameters.
 */
const cursorKey = (table: string) => (table === 'contacts' ? META.lastPulledAt : `cursor:${table}`); // P6 key kept

export const sqliteLocalStore: LocalStore = {
  getCursor: (table) => getMeta(cursorKey(table)),
  setCursor: (table, value) => setMeta(cursorKey(table), value),

  async findRow(table, id) {
    return getDb().getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
  },

  async pendingRows(spec) {
    const flags = ['needs_push', ...(spec.images ?? []).map((i) => i.flag)];
    return getDb().getAllAsync<Row>(`SELECT * FROM ${spec.name} WHERE ${flags.map((f) => `${f} = 1`).join(' OR ')}`);
  },

  async applyRemote(spec, row) {
    const cols = ['id', ...spec.columns, ...(spec.images ?? []).flatMap((i) => [i.column, i.remoteColumn])];
    const flags = ['needs_push', ...(spec.images ?? []).map((i) => i.flag)];
    const sql =
      `INSERT INTO ${spec.name} (${[...cols, ...flags].join(', ')}) ` +
      `VALUES (${[...cols.map(() => '?'), ...flags.map(() => '0')].join(', ')}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${[...cols.slice(1).map((c) => `${c} = excluded.${c}`), ...flags.map((f) => `${f} = 0`)].join(', ')}`;
    await getDb().runAsync(sql, cols.map((c) => (row[c] ?? null) as string | number | null));
  },

  async markPushed(spec: TableSpec, id, updatedAt, patch, clearedImageFlags) {
    const db = getDb();
    for (const [col, value] of Object.entries(patch)) {
      await db.runAsync(`UPDATE ${spec.name} SET ${col} = ? WHERE id = ?`, (value ?? null) as string | null, id);
    }
    const sets = ['needs_push = 0', ...clearedImageFlags.map((f) => `${f} = 0`)];
    await db.runAsync(`UPDATE ${spec.name} SET ${sets.join(', ')} WHERE id = ? AND updated_at = ?`, id, updatedAt);
  },

  async purgeTombstones(table) {
    await getDb().runAsync(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND needs_push = 0`);
  },
};

/** Number of rows still waiting to reach the cloud, across all tables. */
export async function countPending(specs: readonly TableSpec[]): Promise<number> {
  let n = 0;
  for (const spec of specs) n += (await sqliteLocalStore.pendingRows(spec)).length;
  return n;
}
