import { randomUUID } from 'expo-crypto';
import { getDb } from '@/database/db';
import { CONTACT_CHILD_TABLES } from '@/sync/tables';
import { draftToRowValues } from '@/utils/phone';
import type {
  AddressDraft,
  AddressLabel,
  ContactAddress,
  ContactEmail,
  ContactPhone,
  EmailDraft,
  PhoneDraft,
  PhoneLabel,
} from '@/types/contact';

/**
 * Structured phones/emails (schema v2, edited by the P8 form) + contact-child housekeeping.
 * Saving a list keeps row ids stable: unchanged rows are untouched, edited rows are
 * updated, new drafts are inserted and removed rows are tombstoned (so removals sync).
 */

interface PhoneRow {
  id: string;
  contact_id: string;
  label: string;
  country_iso: string | null;
  calling_code: string | null;
  national_number: string;
  e164: string | null;
  raw_input: string | null;
  needs_review: number;
  extension: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

interface AddressRow {
  id: string;
  contact_id: string;
  label: string;
  full_address: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

interface EmailRow {
  id: string;
  contact_id: string;
  label: string;
  address: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const toPhone = (r: PhoneRow): ContactPhone => ({
  id: r.id,
  contactId: r.contact_id,
  label: r.label as PhoneLabel,
  countryIso: r.country_iso,
  callingCode: r.calling_code,
  nationalNumber: r.national_number,
  e164: r.e164,
  rawInput: r.raw_input,
  needsReview: r.needs_review === 1,
  extension: r.extension ?? null,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toAddress = (r: AddressRow): ContactAddress => ({
  id: r.id,
  contactId: r.contact_id,
  label: r.label as AddressLabel,
  fullAddress: r.full_address,
  city: r.city,
  state: r.state,
  country: r.country,
  postalCode: r.postal_code,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEmail = (r: EmailRow): ContactEmail => ({
  id: r.id,
  contactId: r.contact_id,
  label: r.label as ContactEmail['label'],
  address: r.address,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function findPhones(contactId: string): Promise<ContactPhone[]> {
  const rows = await getDb().getAllAsync<PhoneRow>(
    'SELECT * FROM contact_phones WHERE contact_id = ? AND deleted_at IS NULL ORDER BY position',
    contactId,
  );
  return rows.map(toPhone);
}

export async function findEmails(contactId: string): Promise<ContactEmail[]> {
  const rows = await getDb().getAllAsync<EmailRow>(
    'SELECT * FROM contact_emails WHERE contact_id = ? AND deleted_at IS NULL ORDER BY position',
    contactId,
  );
  return rows.map(toEmail);
}

/**
 * Pure diff of an edited list against stored rows, keyed by id (exported for tests).
 * `same` decides whether an existing row needs an UPDATE.
 */
export function planById<D extends { id?: string }, R extends { id: string }>(
  existing: R[],
  drafts: D[],
  same: (row: R, draft: D, position: number) => boolean,
): { insert: { draft: D; position: number }[]; update: { id: string; draft: D; position: number }[]; remove: string[] } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const kept = new Set<string>();
  const insert: { draft: D; position: number }[] = [];
  const update: { id: string; draft: D; position: number }[] = [];
  drafts.forEach((draft, position) => {
    const row = draft.id ? byId.get(draft.id) : undefined;
    if (row && !kept.has(row.id)) {
      kept.add(row.id);
      if (!same(row, draft, position)) update.push({ id: row.id, draft, position });
    } else {
      insert.push({ draft, position });
    }
  });
  const remove = existing.filter((r) => !kept.has(r.id)).map((r) => r.id);
  return { insert, update, remove };
}

export async function replacePhones(contactId: string, drafts: PhoneDraft[], now: string): Promise<void> {
  const db = getDb();
  const existing = await db.getAllAsync<PhoneRow>(
    'SELECT * FROM contact_phones WHERE contact_id = ? AND deleted_at IS NULL',
    contactId,
  );
  const plan = planById(existing, drafts, (r, d, position) => {
    const v = draftToRowValues(d);
    return (
      r.label === d.label &&
      r.country_iso === v.countryIso &&
      r.national_number === v.nationalNumber &&
      r.e164 === v.e164 &&
      r.position === position &&
      (r.extension ?? null) === v.extension &&
      r.needs_review === (d.needsReview ? 1 : 0)
    );
  });

  for (const { draft, position } of plan.insert) {
    const v = draftToRowValues(draft);
    await db.runAsync(
      `INSERT INTO contact_phones (id, contact_id, label, country_iso, calling_code, national_number, e164,
         raw_input, needs_review, extension, position, created_at, updated_at, needs_push)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      randomUUID(), contactId, draft.label, v.countryIso, v.callingCode, v.nationalNumber, v.e164,
      v.rawInput, draft.needsReview ? 1 : 0, v.extension, position, now, now,
    );
  }
  for (const { id, draft, position } of plan.update) {
    const v = draftToRowValues(draft);
    await db.runAsync(
      `UPDATE contact_phones SET label = ?, country_iso = ?, calling_code = ?, national_number = ?, e164 = ?,
         raw_input = ?, needs_review = ?, extension = ?, position = ?, updated_at = ?, needs_push = 1 WHERE id = ?`,
      draft.label, v.countryIso, v.callingCode, v.nationalNumber, v.e164, v.rawInput,
      draft.needsReview ? 1 : 0, v.extension, position, now, id,
    );
  }
  for (const id of plan.remove) {
    await db.runAsync('UPDATE contact_phones SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
  }
}

export async function replaceEmails(contactId: string, drafts: EmailDraft[], now: string): Promise<void> {
  const db = getDb();
  const existing = await db.getAllAsync<EmailRow>(
    'SELECT * FROM contact_emails WHERE contact_id = ? AND deleted_at IS NULL',
    contactId,
  );
  const plan = planById(existing, drafts, (r, d, position) =>
    r.label === d.label && r.address === d.address.trim().toLowerCase() && r.position === position,
  );
  for (const { draft, position } of plan.insert) {
    await db.runAsync(
      `INSERT INTO contact_emails (id, contact_id, label, address, position, created_at, updated_at, needs_push)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      randomUUID(), contactId, draft.label, draft.address.trim().toLowerCase(), position, now, now,
    );
  }
  for (const { id, draft, position } of plan.update) {
    await db.runAsync(
      'UPDATE contact_emails SET label = ?, address = ?, position = ?, updated_at = ?, needs_push = 1 WHERE id = ?',
      draft.label, draft.address.trim().toLowerCase(), position, now, id,
    );
  }
  for (const id of plan.remove) {
    await db.runAsync('UPDATE contact_emails SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
  }
}

export async function findAddresses(contactId: string): Promise<ContactAddress[]> {
  const rows = await getDb().getAllAsync<AddressRow>(
    'SELECT * FROM contact_addresses WHERE contact_id = ? AND deleted_at IS NULL ORDER BY position',
    contactId,
  );
  return rows.map(toAddress);
}

/** Stored values for one address draft: trimmed, empty parts → null, sensible length caps (match 0007 CHECKs). */
export function addressRowValues(d: AddressDraft) {
  const t = (v: string, max: number) => {
    const s = v.trim().replace(/\s+/g, ' ');
    return s ? s.slice(0, max) : null;
  };
  return {
    label: d.label,
    fullAddress: d.fullAddress.trim().replace(/[ \t]+/g, ' ').slice(0, 1000),
    city: t(d.city, 120),
    state: t(d.state, 120),
    country: t(d.country, 120),
    postalCode: t(d.postalCode, 20),
  };
}

export async function replaceAddresses(contactId: string, drafts: AddressDraft[], now: string): Promise<void> {
  const db = getDb();
  const existing = await db.getAllAsync<AddressRow>(
    'SELECT * FROM contact_addresses WHERE contact_id = ? AND deleted_at IS NULL',
    contactId,
  );
  const plan = planById(existing, drafts, (r, d, position) => {
    const v = addressRowValues(d);
    return (
      r.label === v.label &&
      r.full_address === v.fullAddress &&
      r.city === v.city &&
      r.state === v.state &&
      r.country === v.country &&
      r.postal_code === v.postalCode &&
      r.position === position
    );
  });
  for (const { draft, position } of plan.insert) {
    const v = addressRowValues(draft);
    await db.runAsync(
      `INSERT INTO contact_addresses (id, contact_id, label, full_address, city, state, country, postal_code,
         position, created_at, updated_at, needs_push)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      randomUUID(), contactId, v.label, v.fullAddress, v.city, v.state, v.country, v.postalCode, position, now, now,
    );
  }
  for (const { id, draft, position } of plan.update) {
    const v = addressRowValues(draft);
    await db.runAsync(
      `UPDATE contact_addresses SET label = ?, full_address = ?, city = ?, state = ?, country = ?, postal_code = ?,
         position = ?, updated_at = ?, needs_push = 1 WHERE id = ?`,
      v.label, v.fullAddress, v.city, v.state, v.country, v.postalCode, position, now, id,
    );
  }
  for (const id of plan.remove) {
    await db.runAsync('UPDATE contact_addresses SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
  }
}

/** Soft-deletes every row belonging to a contact (phones, emails, links, notes, reminders) so the deletion syncs. */
export async function softDeleteContactChildren(contactId: string, now: string): Promise<void> {
  const db = getDb();
  for (const table of CONTACT_CHILD_TABLES) {
    await db.runAsync(
      `UPDATE ${table} SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE contact_id = ? AND deleted_at IS NULL`,
      now, now, contactId,
    );
  }
}

/** Number of migrated phone numbers whose country still needs confirming. */
export async function countPhonesNeedingReview(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM contact_phones WHERE needs_review = 1 AND deleted_at IS NULL',
  );
  return row?.n ?? 0;
}
