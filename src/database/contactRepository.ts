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
  // v3
  shared_with_org: number;
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
  sharedWithOrg: r.shared_with_org === 1,
  cardBackImagePath: r.card_back_image_path,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const ALIVE = 'deleted_at IS NULL';

export async function insertContact(c: Contact): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO contacts (id, person_name, company_name, designation, phone, email, website, address,
       card_image_path, native_contact_id, raw_ocr_text, is_favourite, created_at, updated_at, needs_push, image_needs_push,
       card_back_image_path, back_image_needs_push, shared_with_org)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    c.id, c.personName, c.companyName, c.designation, c.phone, c.email, c.website, c.address,
    c.cardImagePath, c.nativeContactId, c.rawOcrText, c.isFavourite ? 1 : 0, c.createdAt, c.updatedAt, c.cardImagePath ? 1 : 0,
    c.cardBackImagePath, c.cardBackImagePath ? 1 : 0, c.sharedWithOrg ? 1 : 0,
  );
}

/** Share / unshare with the company. Synced, so the change reaches the cloud. */
export async function setSharedWithOrg(id: string, shared: boolean, now: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE contacts SET shared_with_org = ?, updated_at = ?, needs_push = 1 WHERE id = ? AND ${ALIVE}`,
    shared ? 1 : 0, now, id,
  );
}

/** After leaving a company: un-share locally too (the server already did, with a newer updated_at). */
export async function clearAllSharedLocally(): Promise<void> {
  await getDb().runAsync('UPDATE contacts SET shared_with_org = 0 WHERE shared_with_org = 1');
}

export async function countShared(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM contacts WHERE ${ALIVE} AND shared_with_org = 1`);
  return row?.n ?? 0;
}

/** Star / unstar. Synced (is_favourite is a contacts column in the cloud). */
export async function setFavourite(id: string, favourite: boolean, now: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE contacts SET is_favourite = ?, updated_at = ?, needs_push = 1 WHERE id = ? AND ${ALIVE}`,
    favourite ? 1 : 0, now, id,
  );
}

export async function findFavourites(limit = 20): Promise<Contact[]> {
  const rows = await getDb().getAllAsync<ContactRow>(
    `SELECT * FROM contacts WHERE ${ALIVE} AND is_favourite = 1 ORDER BY person_name COLLATE NOCASE LIMIT ?`,
    limit,
  );
  return rows.map(toContact);
}

export async function updateContactRow(c: Contact, imageChanged: boolean, backImageChanged = false): Promise<void> {
  await getDb().runAsync(
    `UPDATE contacts SET person_name = ?, company_name = ?, designation = ?, phone = ?, email = ?, website = ?,
       address = ?, card_image_path = ?, card_back_image_path = ?, raw_ocr_text = ?, is_favourite = ?, updated_at = ?, needs_push = 1,
       image_needs_push = CASE WHEN ? THEN 1 ELSE image_needs_push END,
       back_image_needs_push = CASE WHEN ? THEN 1 ELSE back_image_needs_push END
     WHERE id = ? AND ${ALIVE}`,
    c.personName, c.companyName, c.designation, c.phone, c.email, c.website, c.address,
    c.cardImagePath, c.cardBackImagePath, c.rawOcrText, c.isFavourite ? 1 : 0, c.updatedAt,
    imageChanged ? 1 : 0, backImageChanged ? 1 : 0, c.id,
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

export interface SearchFilters {
  company?: string | null;
  categoryId?: string | null;
  favouritesOnly?: boolean;
}

/** Case-insensitive search on person/company name, with optional company / category / favourites filters. */
export async function search(query: string, filters: SearchFilters = {}): Promise<Contact[]> {
  const { company, categoryId, favouritesOnly } = filters;
  const clauses = [ALIVE];
  const params: string[] = [];
  if (favouritesOnly) clauses.push('is_favourite = 1');
  if (categoryId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM contact_categories l WHERE l.contact_id = contacts.id AND l.category_id = ? AND l.deleted_at IS NULL)',
    );
    params.push(categoryId);
  }
  const q = query.trim();
  if (q) {
    // Searches everything a person might remember about someone (P12 "enhanced search").
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const L = (col: string) => `${col} LIKE ? ESCAPE '\\'`;
    const ors = [
      ...['person_name', 'company_name', 'designation', 'email', 'website', 'address'].map(L),
      `EXISTS (SELECT 1 FROM contact_emails e WHERE e.contact_id = contacts.id AND e.deleted_at IS NULL AND ${L('e.address')})`,
      `EXISTS (SELECT 1 FROM contact_categories l JOIN categories g ON g.id = l.category_id AND g.deleted_at IS NULL
               WHERE l.contact_id = contacts.id AND l.deleted_at IS NULL AND ${L('g.name')})`,
      `EXISTS (SELECT 1 FROM interactions i WHERE i.contact_id = contacts.id AND i.deleted_at IS NULL
               AND (${L('i.notes')} OR ${L('i.place')}))`,
      `EXISTS (SELECT 1 FROM event_contacts x JOIN events v ON v.id = x.event_id AND v.deleted_at IS NULL
               WHERE x.contact_id = contacts.id AND x.deleted_at IS NULL AND ${L('v.name')})`,
    ];
    params.push(...Array<string>(6).fill(like), like, like, like, like, like);
    // Phone search by digits, ignoring spaces / dashes / "+" ("98672", "+91 98672 99476").
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3 && /^[\d\s+()./-]+$/.test(q)) {
      ors.push(
        `EXISTS (SELECT 1 FROM contact_phones p WHERE p.contact_id = contacts.id AND p.deleted_at IS NULL
                 AND (p.national_number LIKE ? OR p.e164 LIKE ?))`,
        `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?`,
      );
      params.push(`%${digits}%`, `%${digits}%`, `%${digits}%`);
    }
    clauses.push(`(${ors.join(' OR ')})`);
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
