import { Contact as PhoneContact, requestPermissionsAsync, type CreateContactRecord } from 'expo-contacts';
import { showPermissionSettingsAlert } from '@/services/cameraService';
import { imageExists, prepareContactPhoto } from '@/services/imageService';
import { findEmails, findPhones } from '@/database/structuredRepository';
import { dialString } from '@/utils/phone';
import { LABEL_TEXT, type Contact, type ContactEmail, type ContactPhone, type EmailLabel, type PhoneLabel } from '@/types/contact';

/**
 * Saves a Pockit contact into the phone's own Contacts app (expo-contacts).
 *
 * We open Android's native "Create contact" screen pre-filled with the card's
 * details instead of writing silently. The user sees exactly what will be
 * saved, picks WHICH account to save to (e.g. their Google account, so it
 * also syncs to contacts.google.com and their other devices), and taps Save.
 * Afterwards we look the new entry up to remember its id (native_contact_id),
 * so the profile can show "Saved to phone" and open it later.
 */

const splitList = (s: string | null) =>
  (s ?? '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

function splitName(full: string): { givenName: string; familyName?: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0]! };
  return { givenName: parts.slice(0, -1).join(' '), familyName: parts[parts.length - 1] };
}

/**
 * Android's standard phone/email types are mobile / home / work / other; anything else is
 * stored as a custom label and shown as typed ("Personal", "WhatsApp", "Office").
 */
const androidLabel = (l: PhoneLabel | EmailLabel): string =>
  l === 'mobile' || l === 'work' || l === 'other' ? l : LABEL_TEXT[l];

export function toPhoneRecord(c: Contact, phones: ContactPhone[], emails: ContactEmail[]): CreateContactRecord {
  return {
    ...splitName(c.personName),
    company: c.companyName ?? undefined,
    jobTitle: c.designation ?? undefined,
    phones: phones.map((p) => ({ label: androidLabel(p.label), number: dialString(p) })),
    emails: emails.map((e) => ({ label: androidLabel(e.label), address: e.address })),
    urlAddresses: c.website ? [{ label: 'work', url: c.website }] : undefined,
    addresses: c.address ? [{ label: 'work', street: c.address }] : undefined,
    note: 'Added from Pockit',
  };
}

async function ensurePermission(): Promise<boolean> {
  const perm = await requestPermissionsAsync();
  if (perm.granted) return true;
  if (!perm.canAskAgain) showPermissionSettingsAlert('Contacts');
  return false;
}

/** Finds the phone contact we just created, matched by name and (if present) phone number. */
async function findCreatedId(c: Contact): Promise<string | null> {
  const candidates = await PhoneContact.getAll({ name: c.personName });
  const wantDigits = splitList(c.phone).map((p) => p.replace(/\D/g, '').slice(-10));
  for (const candidate of candidates.reverse()) {
    if (!wantDigits.length) return candidate.id;
    const phones = await candidate.getPhones();
    if (phones.some((p) => wantDigits.includes((p.number ?? '').replace(/\D/g, '').slice(-10)))) return candidate.id;
  }
  return null;
}

export type SaveToPhoneResult = { status: 'saved'; nativeId: string | null } | { status: 'cancelled' | 'denied' };

/**
 * Small copy of the saved card image to attach as the phone contact's photo.
 * Returns undefined (save without a photo) if there is no image or it can't be prepared.
 */
async function cardPhotoFor(c: Contact): Promise<string | undefined> {
  if (!imageExists(c.cardImagePath)) return undefined;
  try {
    return await prepareContactPhoto(c.cardImagePath!);
  } catch {
    return undefined;
  }
}

export async function saveToPhoneContacts(c: Contact): Promise<SaveToPhoneResult> {
  if (!(await ensurePermission())) return { status: 'denied' };
  const [phones, emails] = await Promise.all([findPhones(c.id), findEmails(c.id)]);
  // The business card image goes in automatically as the contact's photo.
  const record: CreateContactRecord = { ...toPhoneRecord(c, phones, emails), image: await cardPhotoFor(c) };
  const created = await PhoneContact.presentCreateForm(record);
  if (!created) return { status: 'cancelled' };
  let nativeId: string | null = null;
  try {
    nativeId = await findCreatedId(c);
  } catch {
    // Saved successfully; we just couldn't link it. Not fatal.
  }
  return { status: 'saved', nativeId };
}

/** Whether the linked phone contact still exists (the user may have deleted it). */
export async function phoneContactExists(nativeId: string): Promise<boolean> {
  // Without permission we can't tell; assume it still exists rather than unlinking it.
  if (!(await ensurePermission())) return true;
  try {
    const details = await new PhoneContact(nativeId).getDetails();
    return !!details;
  } catch {
    return false;
  }
}

/**
 * Puts the card image on a contact that was saved to the phone earlier
 * (e.g. before this feature existed). Returns false if there's no card image.
 */
export async function attachCardPhotoToPhoneContact(nativeId: string, c: Contact): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  const photo = await cardPhotoFor(c);
  if (!photo) return false;
  return new PhoneContact(nativeId).setImage(photo);
}

/** Opens the linked contact in the phone's native contact editor. */
export async function openPhoneContact(nativeId: string): Promise<void> {
  if (!(await ensurePermission())) return;
  await new PhoneContact(nativeId).editWithForm();
}
