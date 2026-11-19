import { getDb } from '@/database/db';
import type { Contact } from '@/types/contact';

/**
 * Raw SQL access for contacts. No business rules here (validation, images,
 * sync triggers live in services/contactService.ts). Every query excludes
 * soft-deleted rows. Cloud sync uses src/sync/sqliteLocalStore.ts instead.
 */
export interface ContactRow {
  id: string;
  person_name: string;
  company_name: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  card_image_path: string | null;
  native_contact_id: string | null;
  raw_ocr_text: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  remote_image_path: string | null;
  needs_push: number;
  image_needs_push: number;
  // v2
  is_favourite: number;
  card_back_image_path: string | null;
  remote_back_image_path: string | null;
  back_image_needs_push: number;
}

export const toContact = (r: ContactRow): Contact => ({
  id: r.id,
  personName: r.person_name,
  companyName: r.company_name,
  designation: r.designation,
  phone: r.phone,
  email: r.email,
  website: r.website,
  address: r.address,
  cardImagePath: r.card_image_path,
  nativeContactId: r.native_contact_id,
  rawOcrText: r.raw_ocr_text,
  isFavourite: r.is_favourite === 1,
  cardBackImagePath: r.card_back_image_path,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const ALIVE = 'deleted_at IS NULL';

export async function insertContact(c: Contact): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO contacts (id, person_name, company_name, designation, phone, email, website, address,
       card_image_path, native_contact_id, raw_ocr_text, created_at, updated_at, needs_push, image_needs_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    c.id, c.personName, c.companyName, c.designation, c.phone, c.email, c.website, c.address,
    c.cardImagePath, c.nativeContactId, c.rawOcrText, c.createdAt, c.updatedAt, c.cardImagePath ? 1 : 0,
  );
}

export async function updateContactRow(c: Contact, imageChanged: boolean): Promise<void> {
  await getDb().runAsync(
    `UPDATE contacts SET person_name = ?, company_name = ?, designation = ?, phone = ?, email = ?, website = ?,
       address = ?, card_image_path = ?, raw_ocr_text = ?, updated_at = ?, needs_push = 1,
       image_needs_push = CASE WHEN ? THEN 1 ELSE image_needs_push END
     WHERE id = ? AND ${ALIVE}`,
    c.personName, c.companyName, c.designation, c.phone, c.email, c.website, c.address,
    c.cardImagePath, c.rawOcrText, c.updatedAt, imageChanged ? 1 : 0, c.id,
  );
}

/** Device-local field, never synced, so it doesn't mark the row for push. */
export async function setNativeContactId(id: string, nativeId: string | null): Promise<void> {
  await getDb().runAsync('UPDATE contacts SET native_contact_id = ? WHERE id = ?', nativeId, id);
}

/** Soft delete: keeps a tombstone so the deletion can be synced to the cloud. */
export async function softDeleteContact(id: string, at: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE contacts SET deleted_at = ?, updated_at = ?, card_image_path = NULL, card_back_image_path = NULL,
       needs_push = 1, image_needs_push = 0, back_image_needs_push = 0
     WHERE id = ?`,
    at, at, id,
  );
}

export async function findAll(): Promise<Contact[]> {
  const rows = await getDb().getAllAsync<ContactRow>(`SELECT * FROM contacts WHERE ${ALIVE} ORDER BY created_at DESC`);
  return rows.map(toContact);
}

export async function findById(id: string): Promise<Contact | null> {
  const row = await getDb().getFirstAsync<ContactRow>(`SELECT * FROM contacts WHERE id = ? AND ${ALIVE}`, id);
  return row ? toContact(row) : null;
}

export async function findRecent(limit: number): Promise<Contact[]> {
  const rows = await getDb().getAllAsync<ContactRow>(
    `SELECT * FROM contacts WHERE ${ALIVE} ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
  return rows.map(toContact);
}

/** Case-insensitive search on person/company name, optional exact company filter. */
export async function search(query: string, company: string | null): Promise<Contact[]> {
  const clauses = [ALIVE];
  const params: string[] = [];
  const q = query.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(`(person_name LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  if (company) {
    clauses.push('company_name = ? COLLATE NOCASE');
    params.push(company);
  }
  const rows = await getDb().getAllAsync<ContactRow>(
    `SELECT * FROM contacts WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(toContact);
}

export async function distinctCompanies(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ name: string }>(
    `SELECT MIN(TRIM(company_name)) AS name FROM contacts
     WHERE ${ALIVE} AND company_name IS NOT NULL AND TRIM(company_name) <> ''
     GROUP BY LOWER(TRIM(company_name)) ORDER BY name COLLATE NOCASE`,
  );
  return rows.map((r) => r.name);
}

export async function stats(): Promise<{ total: number; withImage: number; companies: number }> {
  const row = await getDb().getFirstAsync<{ total: number; withImage: number; companies: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN card_image_path IS NOT NULL THEN 1 ELSE 0 END) AS withImage,
            COUNT(DISTINCT NULLIF(LOWER(TRIM(company_name)), '')) AS companies
     FROM contacts WHERE ${ALIVE}`,
  );
  return { total: row?.total ?? 0, withImage: row?.withImage ?? 0, companies: row?.companies ?? 0 };
}

/** Candidates for duplicate detection: rows that have a phone or email at all. */
export async function findWithPhoneOrEmail(): Promise<Contact[]> {
  const rows = await getDb().getAllAsync<ContactRow>(
    `SELECT * FROM contacts WHERE ${ALIVE} AND (phone IS NOT NULL OR email IS NOT NULL)`,
  );
  return rows.map(toContact);
}

export async function listImagePaths(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ p: string }>(
    'SELECT card_image_path AS p FROM contacts WHERE card_image_path IS NOT NULL',
  );
  return rows.map((r) => r.p);
}

export async function setLocalImagePath(id: string, uri: string | null): Promise<void> {
  await getDb().runAsync('UPDATE contacts SET card_image_path = ? WHERE id = ?', uri, id);
}
