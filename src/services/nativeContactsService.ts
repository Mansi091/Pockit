import { Contact as PhoneContact, requestPermissionsAsync, type CreateContactRecord } from 'expo-contacts';
import { showPermissionSettingsAlert } from '@/services/cameraService';
import { imageExists, prepareContactPhoto } from '@/services/imageService';
import { findAddresses, findEmails, findPhones } from '@/database/structuredRepository';
import { dialString } from '@/utils/phone';
import { ADDRESS_LABEL_TEXT, LABEL_TEXT, type Contact, type ContactAddress, type ContactEmail, type ContactPhone, type EmailLabel, type PhoneLabel } from '@/types/contact';

/**
 * Saves a Pockit contact into the phone's own Contacts app (expo-contacts).
 *
 * Default: one-tap direct save (the user tapped "Save to Phone Contacts" —
 * that is the confirmation). It goes to the phone's default contacts account;
 * Android doesn't let apps pick the account here. The new contact's id is kept
 * (native_contact_id) so the profile can show "Saved to Phone · Open".
 * Alternative: `reviewInPhoneContactsForm` opens Android's own pre-filled form,
 * where the user can choose the account (some Contacts apps drop the name there).
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

export function toPhoneRecord(
  c: Contact,
  phones: ContactPhone[],
  emails: ContactEmail[],
  addresses: ContactAddress[] = [],
): CreateContactRecord {
  return {
    ...splitName(c.personName),
    company: c.companyName ?? undefined,
    jobTitle: c.designation ?? undefined,
    phones: phones.map((p) => ({ label: androidLabel(p.label), number: dialString(p) })),
    emails: emails.map((e) => ({ label: androidLabel(e.label), address: e.address })),
    urlAddresses: c.website ? [{ label: 'work', url: c.website }] : undefined,
    // Each address with its own label ("Registered office", "Factory / Plant"); the full text goes in
    // street so Android doesn't print city/PIN twice.
    addresses: addresses.length
      ? addresses.map((a) => ({ label: a.label === 'home' ? 'home' : ADDRESS_LABEL_TEXT[a.label], street: a.fullAddress }))
      : c.address
        ? [{ label: 'work', street: c.address }]
        : undefined,
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

/** Makes a square "whole card on white" photo; provided by <CardPhotoComposer> on the screen. */
export type ComposePhoto = (cardUri: string) => Promise<string | null>;

/**
 * Photo for the phone contact: the whole card centred on a white square when
 * the composer is available, otherwise a plain downsized copy of the card.
 * Returns undefined (save without a photo) if there is no card image.
 */
async function cardPhotoFor(c: Contact, compose?: ComposePhoto): Promise<string | undefined> {
  if (!imageExists(c.cardImagePath)) return undefined;
  try {
    const composed = compose ? await compose(c.cardImagePath!) : null;
    return composed ?? (await prepareContactPhoto(c.cardImagePath!));
  } catch {
    return undefined;
  }
}

async function buildRecord(c: Contact, compose?: ComposePhoto): Promise<CreateContactRecord> {
  const [phones, emails, addresses] = await Promise.all([findPhones(c.id), findEmails(c.id), findAddresses(c.id)]);
  return { ...toPhoneRecord(c, phones, emails, addresses), image: await cardPhotoFor(c, compose) };
}

/**
 * One-tap save straight into the phone's Contacts (default account).
 * Name, company, title, labelled numbers, emails, website, address and the card
 * photo are all written directly — some Contacts apps ignore the name when it's
 * passed through the "Create contact" form, so direct save is the reliable path.
 */
export async function saveToPhoneContacts(c: Contact, compose?: ComposePhoto): Promise<SaveToPhoneResult> {
  if (!(await ensurePermission())) return { status: 'denied' };
  const created = await PhoneContact.create(await buildRecord(c, compose));
  return { status: 'saved', nativeId: created.id };
}

/** Alternative: open Android's own "Create contact" form pre-filled (lets the user pick the account). */
export async function reviewInPhoneContactsForm(c: Contact, compose?: ComposePhoto): Promise<SaveToPhoneResult> {
  if (!(await ensurePermission())) return { status: 'denied' };
  const created = await PhoneContact.presentCreateForm(await buildRecord(c, compose));
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
export async function attachCardPhotoToPhoneContact(nativeId: string, c: Contact, compose?: ComposePhoto): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  const photo = await cardPhotoFor(c, compose);
  if (!photo) return false;
  return new PhoneContact(nativeId).setImage(photo);
}

/** Opens the linked contact in the phone's native contact editor. */
export async function openPhoneContact(nativeId: string): Promise<void> {
  if (!(await ensurePermission())) return;
  await new PhoneContact(nativeId).editWithForm();
}
