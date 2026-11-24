import { extractedPhonesToDrafts, phoneMatchKey, splitLegacyList, textToPhoneDrafts } from '@/utils/phone';
import { summariseAddresses } from '@/services/addressExtraction';
import type { AddressDraft, ContactField, ContactInput, ExtractedAddress, ExtractedFields } from '@/types/contact';

const toAddressDraft = (a: ExtractedAddress): AddressDraft => ({
  label: a.label,
  fullAddress: a.fullAddress,
  city: a.city ?? '',
  state: a.state ?? '',
  country: a.country ?? '',
  postalCode: a.postalCode ?? '',
});

const addressKey = (a: { fullAddress: string }) => a.fullAddress.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Two-sided cards (P11). The FRONT is the source of truth: the back only fills
 * fields that are still empty and adds phone numbers / emails that aren't
 * already there. Nothing the user (or the front scan) entered is overwritten.
 * Pure functions — unit tested in __tests__/cardMerge.test.ts.
 */

export const BACK_SEPARATOR = '\n\n--- Back side ---\n';

/** Turns OCR extraction output into a review-form draft. */
export function draftFromExtraction(
  fields: ExtractedFields | null | undefined,
  cardImagePath: string | null,
  rawOcrText: string | null | undefined,
): ContactInput {
  return {
    personName: fields?.personName ?? '',
    companyName: fields?.companyName ?? null,
    designation: fields?.designation ?? null,
    // Structured numbers keep the card's own labels (Fax, Direct …) and extensions.
    phones: fields?.phones ? extractedPhonesToDrafts(fields.phones) : textToPhoneDrafts(fields?.phone),
    emails: splitLegacyList(fields?.email).map((address, i) => ({ label: i === 0 ? 'work' : 'personal', address })),
    website: fields?.website ?? null,
    address: fields?.address ?? null,
    // Every address block stays separate; older extraction output falls back to the one-line text.
    addresses: fields?.addresses
      ? fields.addresses.map(toAddressDraft)
      : fields?.address
        ? [toAddressDraft({ label: 'other', fullAddress: fields.address, city: null, state: null, country: null, postalCode: null })]
        : [],
    cardImagePath,
    rawOcrText: rawOcrText?.trim() ? rawOcrText : null,
  };
}

/** Front text + back text, each kept readable in the raw-OCR viewer. */
export function joinOcrText(front: string | null | undefined, back: string | null | undefined): string | null {
  const f = front?.trim() ?? '';
  const b = back?.trim() ?? '';
  if (!b) return f || null;
  if (f.includes(b)) return f; // back already appended (e.g. merging twice)
  return f ? `${f}${BACK_SEPARATOR}${b}` : `${BACK_SEPARATOR.trimStart()}${b}`;
}

const SCALARS = ['personName', 'companyName', 'designation', 'website', 'address'] as const;
const blank = (v: string | null | undefined) => !(v ?? '').trim();

export interface MergeResult {
  merged: ContactInput;
  /** Which fields got something new from the back (for the review notice / confidence hints). */
  added: ContactField[];
}

export function mergeBackSide(front: ContactInput, back: ContactInput): MergeResult {
  const merged: ContactInput = { ...front, phones: [...front.phones], emails: [...front.emails] };
  const added: ContactField[] = [];
  const usesList = !!(front.addresses || back.addresses);

  for (const k of SCALARS) {
    if (k === 'address' && usesList) continue; // handled as a list below
    const value = back[k];
    if (blank(front[k]) && !blank(value)) {
      (merged as unknown as Record<string, string | null>)[k] = value ?? null;
      added.push(k);
    }
  }

  // Ignore the empty placeholder row the review form shows for a new contact.
  const realPhones = merged.phones.filter((p) => /\d/.test(p.number));
  const phoneKeys = new Set(realPhones.map((p) => phoneMatchKey(p.number)));
  const newPhones = back.phones.filter((p) => {
    const key = phoneMatchKey(p.number);
    if (!key || phoneKeys.has(key)) return false;
    phoneKeys.add(key);
    return true;
  });
  if (newPhones.length) {
    merged.phones = [...realPhones, ...newPhones];
    added.push('phone');
  }

  const emailKeys = new Set(merged.emails.map((e) => e.address.trim().toLowerCase()));
  const newEmails = back.emails.filter((e) => {
    const key = e.address.trim().toLowerCase();
    if (!key || emailKeys.has(key)) return false;
    emailKeys.add(key);
    return true;
  });
  if (newEmails.length) {
    merged.emails = [...merged.emails, ...newEmails];
    added.push('email');
  }

  if (usesList) {
    // Addresses: keep every front address, add back-side ones not already there.
    const frontList = (front.addresses ?? []).filter((a) => a.fullAddress.trim());
    const keys = new Set(frontList.map(addressKey));
    const newAddresses = (back.addresses ?? []).filter((a) => {
      const k = addressKey(a);
      if (!k || keys.has(k)) return false;
      keys.add(k);
      return true;
    });
    merged.addresses = [...frontList, ...newAddresses];
    merged.address = summariseAddresses(merged.addresses);
    if (newAddresses.length) added.push('address');
  }

  merged.rawOcrText = joinOcrText(front.rawOcrText, back.rawOcrText);
  return { merged, added };
}

const FIELD_TEXT: Record<ContactField, string> = {
  personName: 'name',
  companyName: 'company',
  designation: 'designation',
  phone: 'phone number',
  email: 'email',
  website: 'website',
  address: 'address',
};

/** "phone number and address" — for the "Added from the back" notice. */
export function describeAdded(added: ContactField[]): string {
  const words = added.map((f) => FIELD_TEXT[f]);
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
