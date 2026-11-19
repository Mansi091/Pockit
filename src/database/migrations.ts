import type { SQLiteDatabase } from 'expo-sqlite';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { classifyPhone, splitLegacyList, splitLegacyPhones } from '@/utils/phone';

/**
 * Schema migrations, tracked with SQLite's `PRAGMA user_version`.
 * NEVER edit a migration that has shipped — append a new one instead.
 *
 * Each step runs inside ONE transaction together with its version bump, so a
 * failure (including a failed data verification) rolls back completely and
 * the database stays at the previous version. Steps marked `backup` first
 * write a consistent copy of the database next to it (VACUUM INTO).
 */
interface Migration {
  version: number;
  description: string;
  backup?: boolean;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'contacts + meta',
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS contacts (
          id                TEXT PRIMARY KEY NOT NULL,
          person_name       TEXT NOT NULL,
          company_name      TEXT,
          designation       TEXT,
          phone             TEXT,
          email             TEXT,
          website           TEXT,
          address           TEXT,
          card_image_path   TEXT,
          native_contact_id TEXT,
          raw_ocr_text      TEXT,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL,
          deleted_at        TEXT,
          remote_image_path TEXT,
          needs_push        INTEGER NOT NULL DEFAULT 1,
          image_needs_push  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts (company_name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_contacts_push ON contacts (needs_push);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      `);
    },
  },
  {
    version: 2,
    description: 'structured phones/emails, categories, events, interactions, reminders, favourites, back image',
    backup: true,
    up: async (db) => {
      await db.execAsync(SCHEMA_V2);
      await migrateLegacyPhonesAndEmails(db);
    },
  },
];

export const SCHEMA_VERSION = migrations[migrations.length - 1]!.version;

/**
 * v2 DDL. Local child tables intentionally have NO foreign-key constraints:
 * cloud sync can deliver a child before its parent, so integrity is kept by
 * the services (cascade soft-deletes) and enforced server-side by Postgres.
 * Every synced table carries created/updated/deleted timestamps + needs_push.
 */
export const SCHEMA_V2 = `
  ALTER TABLE contacts ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE contacts ADD COLUMN card_back_image_path TEXT;
  ALTER TABLE contacts ADD COLUMN remote_back_image_path TEXT;
  ALTER TABLE contacts ADD COLUMN back_image_needs_push INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_contacts_favourite ON contacts (is_favourite) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS contact_phones (
    id              TEXT PRIMARY KEY NOT NULL,
    contact_id      TEXT NOT NULL,
    label           TEXT NOT NULL DEFAULT 'mobile',
    country_iso     TEXT,
    calling_code    TEXT,
    national_number TEXT NOT NULL,
    e164            TEXT,
    raw_input       TEXT,
    needs_review    INTEGER NOT NULL DEFAULT 0,
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    needs_push      INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_phones_contact ON contact_phones (contact_id);
  CREATE INDEX IF NOT EXISTS idx_phones_e164 ON contact_phones (e164);
  CREATE INDEX IF NOT EXISTS idx_phones_push ON contact_phones (needs_push);

  CREATE TABLE IF NOT EXISTS contact_emails (
    id          TEXT PRIMARY KEY NOT NULL,
    contact_id  TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT 'work',
    address     TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_emails_contact ON contact_emails (contact_id);
  CREATE INDEX IF NOT EXISTS idx_emails_address ON contact_emails (address COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_emails_push ON contact_emails (needs_push);

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#4F46E5',
    icon        TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_categories_push ON categories (needs_push);

  CREATE TABLE IF NOT EXISTS contact_categories (
    id          TEXT PRIMARY KEY NOT NULL,
    contact_id  TEXT NOT NULL,
    category_id TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1,
    UNIQUE (contact_id, category_id)
  );
  CREATE INDEX IF NOT EXISTS idx_contact_categories_category ON contact_categories (category_id);
  CREATE INDEX IF NOT EXISTS idx_contact_categories_push ON contact_categories (needs_push);

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    location    TEXT,
    starts_on   TEXT,
    ends_on     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_events_push ON events (needs_push);

  CREATE TABLE IF NOT EXISTS event_contacts (
    id          TEXT PRIMARY KEY NOT NULL,
    event_id    TEXT NOT NULL,
    contact_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1,
    UNIQUE (event_id, contact_id)
  );
  CREATE INDEX IF NOT EXISTS idx_event_contacts_contact ON event_contacts (contact_id);
  CREATE INDEX IF NOT EXISTS idx_event_contacts_push ON event_contacts (needs_push);

  CREATE TABLE IF NOT EXISTS interactions (
    id          TEXT PRIMARY KEY NOT NULL,
    contact_id  TEXT NOT NULL,
    occurred_on TEXT,
    place       TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    needs_push  INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions (contact_id, occurred_on DESC);
  CREATE INDEX IF NOT EXISTS idx_interactions_push ON interactions (needs_push);

  CREATE TABLE IF NOT EXISTS reminders (
    id              TEXT PRIMARY KEY NOT NULL,
    contact_id      TEXT NOT NULL,
    title           TEXT NOT NULL,
    due_at          TEXT NOT NULL,
    completed_at    TEXT,
    notification_id TEXT,              -- device-local scheduled notification; never synced
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    needs_push      INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (due_at) WHERE deleted_at IS NULL AND completed_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_reminders_contact ON reminders (contact_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_push ON reminders (needs_push);
`;

export interface MigrationV2Report {
  contacts: number;
  phonesSource: number;
  phonesCreated: number;
  phonesNeedingReview: number;
  emailsSource: number;
  emailsCreated: number;
  at: string;
}

/**
 * Copies every legacy comma-separated phone/email into structured rows, then
 * verifies the counts. A mismatch throws, rolling back the whole v2 step.
 * The legacy columns are left untouched (expand → validate → contract later).
 */
export async function migrateLegacyPhonesAndEmails(db: SQLiteDatabase): Promise<MigrationV2Report> {
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<{ id: string; phone: string | null; email: string | null }>(
    'SELECT id, phone, email FROM contacts',
  );

  let phonesSource = 0;
  let emailsSource = 0;
  let phonesNeedingReview = 0;

  for (const row of rows) {
    const phones = splitLegacyPhones(row.phone);
    phonesSource += phones.length;
    for (const [position, raw] of phones.entries()) {
      const c = classifyPhone(raw);
      if (c.needsReview) phonesNeedingReview += 1;
      await db.runAsync(
        `INSERT INTO contact_phones (id, contact_id, label, country_iso, calling_code, national_number, e164,
           raw_input, needs_review, position, created_at, updated_at, needs_push)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        randomUUID(), row.id, c.suggestedLabel, c.countryIso, c.callingCode, c.nationalNumber, c.e164,
        c.rawInput, c.needsReview ? 1 : 0, position, now, now,
      );
    }

    const emails = splitLegacyList(row.email);
    emailsSource += emails.length;
    for (const [position, address] of emails.entries()) {
      await db.runAsync(
        `INSERT INTO contact_emails (id, contact_id, label, address, position, created_at, updated_at, needs_push)
         VALUES (?, ?, 'work', ?, ?, ?, ?, 1)`,
        randomUUID(), row.id, address.toLowerCase(), position, now, now,
      );
    }
  }

  const count = async (table: string) =>
    (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;
  const report: MigrationV2Report = {
    contacts: rows.length,
    phonesSource,
    phonesCreated: await count('contact_phones'),
    phonesNeedingReview,
    emailsSource,
    emailsCreated: await count('contact_emails'),
    at: now,
  };

  verifyMigrationV2(report);
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES ('migration_v2_report', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(report),
  );
  return report;
}

/** Throws if any legacy value was not carried over exactly once. */
export function verifyMigrationV2(r: MigrationV2Report): void {
  if (r.phonesCreated !== r.phonesSource) {
    throw new Error(`Migration v2 check failed: ${r.phonesSource} phone(s) in source, ${r.phonesCreated} created.`);
  }
  if (r.emailsCreated !== r.emailsSource) {
    throw new Error(`Migration v2 check failed: ${r.emailsSource} email(s) in source, ${r.emailsCreated} created.`);
  }
}

/** Consistent copy of the database file (works in WAL mode). Overwrites an older backup. */
async function backupDatabase(db: SQLiteDatabase, fromVersion: number): Promise<void> {
  const path = `${db.databasePath}.v${fromVersion}.bak`;
  try {
    const existing = new File(path.startsWith('file://') ? path : `file://${path}`);
    if (existing.exists) existing.delete();
  } catch {
    // ignore — VACUUM INTO will report a real problem
  }
  await db.runAsync('VACUUM INTO ?', path);
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (const m of migrations) {
    if (m.version <= version) continue;
    if (m.backup && version > 0) await backupDatabase(db, version); // only if there is data to protect
    await db.withTransactionAsync(async () => {
      await m.up(db);
      // PRAGMA can't be parameterised; `m.version` is a constant we control.
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    version = m.version;
  }
}
