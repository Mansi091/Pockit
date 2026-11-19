import * as SQLite from 'expo-sqlite';
import { migrate } from '@/database/migrations';

/**
 * Database lifecycle. Each signed-in user gets their OWN SQLite file
 * (`smartcard_<userId>.db`), so on a shared phone one account can never
 * read another account's contacts. Opened at sign-in, closed at sign-out.
 */
let current: { userId: string; db: SQLite.SQLiteDatabase } | null = null;

const fileNameFor = (userId: string) => `smartcard_${userId.replace(/[^a-zA-Z0-9-]/g, '')}.db`;

export async function openUserDatabase(userId: string): Promise<SQLite.SQLiteDatabase> {
  if (current?.userId === userId) return current.db;
  await closeUserDatabase();
  const db = await SQLite.openDatabaseAsync(fileNameFor(userId));
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  current = { userId, db };
  return db;
}

export async function closeUserDatabase(): Promise<void> {
  if (!current) return;
  const { db } = current;
  current = null;
  await db.closeAsync();
}

/** Removes the user's database file entirely (used by Delete Account). */
export async function deleteUserDatabase(userId: string): Promise<void> {
  if (current?.userId === userId) await closeUserDatabase();
  await SQLite.deleteDatabaseAsync(fileNameFor(userId));
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!current) throw new Error('Database is not open. Is the user signed in?');
  return current.db;
}

export function getCurrentUserId(): string {
  if (!current) throw new Error('Database is not open. Is the user signed in?');
  return current.userId;
}

export function databaseFileName(): string | null {
  return current ? fileNameFor(current.userId) : null;
}
