import { phoneMatchKey, splitLegacyList, textToPhoneDrafts } from '@/utils/phone';
import type { ContactField, ContactInput, ExtractedFields } from '@/types/contact';

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
    phones: textToPhoneDrafts(fields?.phone),
    emails: splitLegacyList(fields?.email).map((address, i) => ({ label: i === 0 ? 'work' : 'personal', address })),
    website: fields?.website ?? null,
    address: fields?.address ?? null,
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

  for (const k of SCALARS) {
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
