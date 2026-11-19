import { randomUUID } from 'expo-crypto';
import * as repo from '@/database/contactRepository';
import { getCurrentUserId, getDb } from '@/database/db';
import * as structured from '@/database/structuredRepository';
import * as categories from '@/database/categoryRepository';
import { deleteImage, persistCardImage } from '@/services/imageService';
import { emitContactsChanged } from '@/services/dataEvents';
import { requestSync } from '@/services/syncService';
import { draftToRowValues, formatPhone, phoneMatchKey } from '@/utils/phone';
import type {
  Contact,
  ContactEmail,
  ContactInput,
  ContactPhone,
  DashboardStats,
  DuplicateMatch,
  EmailDraft,
  PhoneDraft,
} from '@/types/contact';

/**
 * Contact business logic used by the UI. SQLite is the source of truth; every
 * write marks rows for cloud sync and notifies screens.
 *
 * P8: phones/emails are saved as structured rows. The legacy contacts.phone /
 * contacts.email columns are kept up to date as a display summary (expand phase)
 * so search, duplicate detection and the cloud copy stay consistent until the
 * "contract" migration removes them.
 */
const normalise = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const splitList = (s: string | null | undefined) =>
  (s ?? '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

export interface CleanInput extends Omit<ContactInput, 'phones' | 'emails'> {
  phones: PhoneDraft[];
  emails: EmailDraft[];
}

/** Trims text, drops empty phone/email rows and turns empty strings into null. */
export function cleanInput(input: ContactInput): CleanInput {
  const t = (v: string | null) => {
    const s = (v ?? '').trim();
    return s.length ? s : null;
  };
  return {
    personName: (input.personName ?? '').trim(),
    companyName: t(input.companyName),
    designation: t(input.designation),
    phones: input.phones.filter((p) => /\d/.test(p.number)).map((p) => ({ ...p, number: p.number.trim() })),
    emails: input.emails.filter((e) => e.address.trim()).map((e) => ({ ...e, address: e.address.trim().toLowerCase() })),
    website: t(input.website),
    address: t(input.address),
    cardImagePath: input.cardImagePath,
    rawOcrText: t(input.rawOcrText),
    categoryIds: input.categoryIds,
    isFavourite: input.isFavourite,
  };
}

/** Legacy summary columns: "+91 98765 43210, +1 415-555-0142" / "a@b.com, c@d.com". */
export function summarise(data: Pick<CleanInput, 'phones' | 'emails'>): { phone: string | null; email: string | null } {
  const phones = data.phones.map((p) => formatPhone(draftToRowValues(p)));
  return {
    phone: phones.length ? phones.join(', ') : null,
    email: data.emails.length ? data.emails.map((e) => e.address).join(', ') : null,
  };
}

function changed() {
  emitContactsChanged();
  requestSync();
}

export const getAllContacts = (): Promise<Contact[]> => repo.findAll();
export const getContactById = (id: string): Promise<Contact | null> => repo.findById(id);
export const getRecentContacts = (limit = 5): Promise<Contact[]> => repo.findRecent(limit);
export const searchContacts = (query: string, filters: repo.SearchFilters = {}): Promise<Contact[]> =>
  repo.search(query, filters);
export const getFavourites = (limit?: number): Promise<Contact[]> => repo.findFavourites(limit);

/** Star / unstar a contact (synced). */
export async function setFavourite(id: string, favourite: boolean): Promise<void> {
  await repo.setFavourite(id, favourite, new Date().toISOString());
  changed();
}
export const getCompanies = (): Promise<string[]> => repo.distinctCompanies();

export interface ContactDetails {
  contact: Contact;
  phones: ContactPhone[];
  emails: ContactEmail[];
  categoryIds: string[];
}

/** Contact + its structured phones and emails (profile & edit screens). */
export async function getContactDetails(id: string): Promise<ContactDetails | null> {
  const contact = await repo.findById(id);
  if (!contact) return null;
  const [phones, emails, categoryIds] = await Promise.all([
    structured.findPhones(id),
    structured.findEmails(id),
    categories.categoryIdsForContact(id),
  ]);
  return { contact, phones, emails, categoryIds };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const s = await repo.stats();
  return { totalContacts: s.total, totalScannedCards: s.withImage, uniqueCompanies: s.companies };
}

/**
 * Existing contacts that share any phone number (compared on the last 10 digits,
 * so "+91 98765 43210" matches "098765 43210") or any email address.
 */
export async function findDuplicates(
  input: Pick<ContactInput, 'phones' | 'emails'>,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const phones = new Set(input.phones.map((p) => phoneMatchKey(p.number)).filter((k) => k.length >= 7));
  const emails = new Set(input.emails.map((e) => normalise(e.address)).filter(Boolean));
  if (!phones.size && !emails.size) return [];

  const matches: DuplicateMatch[] = [];
  for (const c of await repo.findWithPhoneOrEmail()) {
    if (c.id === excludeId) continue;
    const matchedOn: DuplicateMatch['matchedOn'] = [];
    if (splitList(c.phone).some((p) => phones.has(phoneMatchKey(p)))) matchedOn.push('phone');
    if (splitList(c.email).some((e) => emails.has(normalise(e)))) matchedOn.push('email');
    if (matchedOn.length) matches.push({ contact: c, matchedOn });
  }
  return matches;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const data = cleanInput(input);
  if (!data.personName) throw new Error('Person name is required.');
  const id = randomUUID();
  const ts = new Date().toISOString();
  const cardImagePath = data.cardImagePath ? await persistCardImage(getCurrentUserId(), data.cardImagePath, id) : null;
  const contact: Contact = {
    id,
    personName: data.personName,
    companyName: data.companyName,
    designation: data.designation,
    ...summarise(data),
    website: data.website,
    address: data.address,
    cardImagePath,
    nativeContactId: null,
    rawOcrText: data.rawOcrText,
    isFavourite: !!data.isFavourite,
    cardBackImagePath: null,
    createdAt: ts,
    updatedAt: ts,
  };
  try {
    // Contact + its structured phones/emails are written atomically.
    await getDb().withTransactionAsync(async () => {
      await repo.insertContact(contact);
      await structured.replacePhones(id, data.phones, ts);
      await structured.replaceEmails(id, data.emails, ts);
      if (data.categoryIds?.length) await categories.setContactCategories(id, data.categoryIds, ts);
    });
  } catch (e) {
    deleteImage(cardImagePath); // don't leave an orphaned file behind
    throw e;
  }
  changed();
  return contact;
}

export async function updateContact(id: string, input: ContactInput): Promise<Contact> {
  const existing = await repo.findById(id);
  if (!existing) throw new Error('Contact not found.');
  const data = cleanInput(input);
  if (!data.personName) throw new Error('Person name is required.');

  let cardImagePath = existing.cardImagePath;
  const imageChanged = data.cardImagePath !== existing.cardImagePath;
  if (imageChanged) {
    cardImagePath = data.cardImagePath ? await persistCardImage(getCurrentUserId(), data.cardImagePath, id) : null;
    if (!cardImagePath) deleteImage(existing.cardImagePath);
  }
  const now = new Date().toISOString();
  const updated: Contact = {
    ...existing,
    personName: data.personName,
    companyName: data.companyName,
    designation: data.designation,
    ...summarise(data),
    website: data.website,
    address: data.address,
    rawOcrText: data.rawOcrText,
    isFavourite: data.isFavourite ?? existing.isFavourite,
    cardImagePath,
    updatedAt: now,
  };
  await getDb().withTransactionAsync(async () => {
    await repo.updateContactRow(updated, imageChanged);
    await structured.replacePhones(id, data.phones, now);
    await structured.replaceEmails(id, data.emails, now);
    if (data.categoryIds) await categories.setContactCategories(id, data.categoryIds, now);
  });
  changed();
  return updated;
}

export async function deleteContact(id: string): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) return;
  const now = new Date().toISOString();
  // Tombstone the contact AND its child rows so the deletion syncs everywhere.
  await getDb().withTransactionAsync(async () => {
    await repo.softDeleteContact(id, now);
    await structured.softDeleteContactChildren(id, now);
  });
  deleteImage(existing.cardImagePath);
  deleteImage(existing.cardBackImagePath);
  changed();
}

export async function linkNativeContact(id: string, nativeId: string | null): Promise<void> {
  await repo.setNativeContactId(id, nativeId);
  emitContactsChanged();
}

/** "Person Name – Company Name" (company omitted when blank). */
export function displayName(c: Pick<Contact, 'personName' | 'companyName'>): string {
  return c.companyName ? `${c.personName} – ${c.companyName}` : c.personName;
}
