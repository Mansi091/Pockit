/**
 * Contracts for the generic sync engine. The engine only talks to these
 * interfaces, which is what makes it unit-testable with in-memory fakes.
 */
export type Row = Record<string, unknown> & { id: string };

/** A card image attached to a row (contacts only): local file ↔ cloud storage object. */
export interface ImageSpec {
  /** Local column holding the device file URI; the SAME column name holds the storage path in the cloud. */
  column: string;
  /** Local column remembering which storage path the local file corresponds to. */
  remoteColumn: string;
  /** Local flag: 1 = this image changed and must be uploaded. */
  flag: string;
  /** Storage object name suffix: '' → <uid>/<id>.jpg, '_back' → <uid>/<id>_back.jpg */
  suffix: string;
}

export interface TableSpec {
  /** Same name locally and in Supabase. */
  name: string;
  /** Synced data columns (excluding id, user_id, image columns and local-only flags). */
  columns: readonly string[];
  /** Columns stored as INTEGER 0/1 locally and boolean in Postgres. */
  booleans?: readonly string[];
  /** Timestamp columns, normalised to ISO-8601 UTC ("…Z") when pulled. */
  timestamps?: readonly string[];
  images?: readonly ImageSpec[];
  /** Child tables are soft-deleted with their contact; used for documentation and checks. */
  parent?: string;
}

export interface LocalStore {
  getCursor(table: string): Promise<string | null>;
  setCursor(table: string, value: string): Promise<void>;
  findRow(table: string, id: string): Promise<Row | null>;
  /** Rows with needs_push = 1 or any image flag = 1. */
  pendingRows(spec: TableSpec): Promise<Row[]>;
  /** Insert/update a row that came from the cloud and mark it clean. */
  applyRemote(spec: TableSpec, row: Row): Promise<void>;
  /** Clear push flags — only if the row wasn't edited again meanwhile (same updated_at). */
  markPushed(spec: TableSpec, id: string, updatedAt: string, patch: Record<string, unknown>, clearedImageFlags: string[]): Promise<void>;
  purgeTombstones(table: string): Promise<void>;
}

export interface RemoteStore {
  /** Rows with server_updated_at > cursor, ascending, at most `limit`. */
  pull(table: string, cursor: string, limit: number): Promise<(Row & { server_updated_at: string })[]>;
  upsert(table: string, rows: Row[]): Promise<void>;
  uploadImage(storagePath: string, localUri: string): Promise<boolean>;
  removeImage(storagePath: string): Promise<boolean>;
  /** Downloads to the device; returns the local URI or null on failure (retried next sync). */
  downloadImage(storagePath: string, rowId: string, suffix: string): Promise<string | null>;
}

export interface FileAccess {
  exists(uri: string | null | undefined): boolean;
  remove(uri: string | null | undefined): void;
}

export class CloudSchemaOutdatedError extends Error {
  constructor(table: string) {
    super(`The cloud database is missing "${table}". Run supabase/migrations/0002_structured_data.sql in Supabase, then sync again.`);
    this.name = 'CloudSchemaOutdatedError';
  }
}
