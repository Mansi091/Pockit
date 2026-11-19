import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { getDb } from '@/database/db';
import type { Category } from '@/types/contact';

/**
 * Categories (user-defined groups) and the contact ↔ category many-to-many links.
 * Links use a DETERMINISTIC id derived from the (contact, category) pair, so two
 * devices that link the same pair offline produce the same row and never clash
 * on the cloud's unique (contact_id, category_id) constraint. Removing a link
 * tombstones it; re-adding revives the same row.
 */

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithCount extends Category {
  count: number;
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  color: r.color,
  icon: r.icon,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Formats 32+ hex chars as an RFC-4122-shaped UUID (version 5 / variant bits set). Exported for tests. */
export function hexToUuid(hex: string): string {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32).padEnd(32, '0');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function linkId(contactId: string, categoryId: string): Promise<string> {
  return hexToUuid(await digestStringAsync(CryptoDigestAlgorithm.SHA256, `contact_category:${contactId}:${categoryId}`));
}

/** All live categories with the number of live contacts in each, ordered by position then name. */
export async function findAllWithCounts(): Promise<CategoryWithCount[]> {
  const rows = await getDb().getAllAsync<CategoryRow & { count: number }>(
    `SELECT c.*, (
        SELECT COUNT(*) FROM contact_categories l
        JOIN contacts k ON k.id = l.contact_id AND k.deleted_at IS NULL
        WHERE l.category_id = c.id AND l.deleted_at IS NULL
      ) AS count
     FROM categories c WHERE c.deleted_at IS NULL
     ORDER BY c.position, c.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...toCategory(r), count: r.count }));
}

export async function findById(id: string): Promise<Category | null> {
  const row = await getDb().getFirstAsync<CategoryRow>('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toCategory(row) : null;
}

export async function nameExists(name: string, excludeId?: string): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM categories WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ?',
    name,
    excludeId ?? '',
  );
  return (row?.n ?? 0) > 0;
}

export async function insert(input: { name: string; color: string; icon: string | null }, now: string): Promise<Category> {
  const db = getDb();
  const pos = (await db.getFirstAsync<{ p: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories'))?.p ?? 0;
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO categories (id, name, color, icon, position, created_at, updated_at, needs_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    id, input.name, input.color, input.icon, pos, now, now,
  );
  return { id, name: input.name, color: input.color, icon: input.icon, position: pos, createdAt: now, updatedAt: now };
}

export async function update(id: string, input: { name: string; color: string; icon: string | null }, now: string): Promise<void> {
  await getDb().runAsync(
    'UPDATE categories SET name = ?, color = ?, icon = ?, updated_at = ?, needs_push = 1 WHERE id = ?',
    input.name, input.color, input.icon, now, id,
  );
}

/** Deletes a category and unlinks every contact from it (contacts themselves are kept). */
export async function softDelete(id: string, now: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
  await db.runAsync(
    'UPDATE contact_categories SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE category_id = ? AND deleted_at IS NULL',
    now, now, id,
  );
}

export async function categoryIdsForContact(contactId: string): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ category_id: string }>(
    `SELECT l.category_id FROM contact_categories l
     JOIN categories c ON c.id = l.category_id AND c.deleted_at IS NULL
     WHERE l.contact_id = ? AND l.deleted_at IS NULL`,
    contactId,
  );
  return rows.map((r) => r.category_id);
}

/** Makes the contact's categories exactly `categoryIds` (adds, revives and tombstones links). */
export async function setContactCategories(contactId: string, categoryIds: string[], now: string): Promise<void> {
  const db = getDb();
  const want = new Set(categoryIds);
  const existing = await db.getAllAsync<{ id: string; category_id: string; deleted_at: string | null }>(
    'SELECT id, category_id, deleted_at FROM contact_categories WHERE contact_id = ?',
    contactId,
  );
  const byCategory = new Map(existing.map((e) => [e.category_id, e]));

  for (const categoryId of want) {
    const row = byCategory.get(categoryId);
    if (!row) {
      await db.runAsync(
        `INSERT INTO contact_categories (id, contact_id, category_id, created_at, updated_at, needs_push)
         VALUES (?, ?, ?, ?, ?, 1)`,
        await linkId(contactId, categoryId), contactId, categoryId, now, now,
      );
    } else if (row.deleted_at) {
      await db.runAsync('UPDATE contact_categories SET deleted_at = NULL, updated_at = ?, needs_push = 1 WHERE id = ?', now, row.id);
    }
  }
  for (const row of existing) {
    if (!row.deleted_at && !want.has(row.category_id)) {
      await db.runAsync('UPDATE contact_categories SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, row.id);
    }
  }
}

/** Pairs of categories that share contacts, with how many (for the Connections view). */
export async function overlaps(): Promise<{ a: string; b: string; shared: number }[]> {
  return getDb().getAllAsync<{ a: string; b: string; shared: number }>(
    `SELECT x.category_id AS a, y.category_id AS b, COUNT(*) AS shared
     FROM contact_categories x
     JOIN contact_categories y ON y.contact_id = x.contact_id AND x.category_id < y.category_id
     JOIN contacts k ON k.id = x.contact_id AND k.deleted_at IS NULL
     JOIN categories cx ON cx.id = x.category_id AND cx.deleted_at IS NULL
     JOIN categories cy ON cy.id = y.category_id AND cy.deleted_at IS NULL
     WHERE x.deleted_at IS NULL AND y.deleted_at IS NULL
     GROUP BY x.category_id, y.category_id`,
  );
}
