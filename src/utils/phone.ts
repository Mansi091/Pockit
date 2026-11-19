import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import type { ContactPhone, PhoneDraft, PhoneLabel } from '@/types/contact';

/**
 * Phone-number classification shared by the v2 data migration and the
 * legacy-string → structured-rows bridge.
 *
 * Rule (from the product owner): only assign +91 when the number is
 * *confirmed* Indian. "Valid when parsed as Indian" is NOT enough — e.g.
 * "(415) 555-0142" (a US number) is a syntactically valid Indian landline.
 * Confirmation requires one of:
 *   - an explicit +91 / 0091 / 91XXXXXXXXXX prefix
 *   - a valid Indian MOBILE (10 digits starting 6–9, optional leading 0)
 *   - a leading STD trunk "0" AND valid as an Indian number (e.g. 020 2567 8900)
 * Anything else — including numbers with another explicit country code — is
 * stored as typed and flagged `needsReview` so the user can confirm it.
 */
export interface ClassifiedPhone {
  rawInput: string;
  countryIso: string | null; // 'IN', 'US', … — null when unknown
  callingCode: string | null; // '91', '1', … — null when unknown
  nationalNumber: string; // digits only
  e164: string | null; // '+919876543210' — null when the country is unknown
  needsReview: boolean;
  suggestedLabel: PhoneLabel;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

function fromParsed(rawInput: string, p: ReturnType<typeof parsePhoneNumberFromString>, needsReview: boolean): ClassifiedPhone | null {
  if (!p || !p.isValid()) return null;
  const type = p.getType();
  return {
    rawInput,
    countryIso: p.country ?? null,
    callingCode: p.countryCallingCode,
    nationalNumber: p.nationalNumber,
    e164: p.number,
    needsReview,
    suggestedLabel: type === 'MOBILE' ? 'mobile' : type === 'FIXED_LINE' ? 'work' : 'other',
  };
}

function unknown(rawInput: string): ClassifiedPhone {
  return {
    rawInput,
    countryIso: null,
    callingCode: null,
    nationalNumber: digitsOf(rawInput),
    e164: null,
    needsReview: true,
    suggestedLabel: 'other',
  };
}

export function classifyPhone(input: string): ClassifiedPhone {
  const rawInput = input.trim().slice(0, 64);
  const digits = digitsOf(rawInput);

  // 1. Explicit international prefix: "+…" or "00…"
  if (rawInput.startsWith('+') || digits.startsWith('00')) {
    const normalised = rawInput.startsWith('+') ? rawInput : `+${digits.slice(2)}`;
    const p = parsePhoneNumberFromString(normalised);
    const result = fromParsed(rawInput, p, /* review unless India */ p?.country !== 'IN');
    return result ?? unknown(rawInput);
  }

  // 2. "91" + 10-digit Indian mobile written without the plus
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    const result = fromParsed(rawInput, parsePhoneNumberFromString(`+${digits}`), false);
    if (result?.countryIso === 'IN') return result;
  }

  // 3. Indian mobile: 10 digits starting 6–9 (optionally with a leading 0)
  if (/^0?[6-9]\d{9}$/.test(digits)) {
    const p = parsePhoneNumberFromString(digits, 'IN');
    if (p?.isValid() && p.getType() === 'MOBILE') return fromParsed(rawInput, p, false)!;
  }

  // 4. Indian landline written with its STD trunk "0"
  if (digits.startsWith('0')) {
    const p = parsePhoneNumberFromString(digits, 'IN');
    if (p?.isValid()) return fromParsed(rawInput, p, false)!;
  }

  // 5. No proof of country → keep as typed, ask the user
  return unknown(rawInput);
}

// ── P8: structured drafts ─────────────────────────────────────────────

/** Database values for one phone draft. */
export interface PhoneRowValues {
  countryIso: string | null;
  callingCode: string | null;
  nationalNumber: string;
  e164: string | null;
  rawInput: string;
}

/**
 * Converts what the user typed (+ the chosen country) into stored values.
 * A number typed with "+" wins over the dropdown (e.g. "+971 50 123 4567").
 */
export function draftToRowValues(draft: Pick<PhoneDraft, 'countryIso' | 'number'>): PhoneRowValues {
  const raw = draft.number.trim().slice(0, 64);
  const parsed = raw.startsWith('+')
    ? parsePhoneNumberFromString(raw)
    : draft.countryIso
      ? parsePhoneNumberFromString(raw, draft.countryIso as CountryCode)
      : undefined;
  if (parsed) {
    return {
      countryIso: parsed.country ?? draft.countryIso,
      callingCode: parsed.countryCallingCode,
      nationalNumber: parsed.nationalNumber,
      e164: parsed.number,
      rawInput: raw,
    };
  }
  return { countryIso: draft.countryIso, callingCode: null, nationalNumber: digitsOf(raw), e164: null, rawInput: raw };
}

export interface PhoneIssue {
  /** Blocks saving. */
  error: string | null;
  /** Shown, but the contact can still be saved. */
  warning: string | null;
}

/** Empty rows are fine (ignored on save). Too short/long is an error; "not valid for <country>" is a warning. */
export function checkPhoneDraft(draft: Pick<PhoneDraft, 'countryIso' | 'number' | 'needsReview'>, countryName?: string): PhoneIssue {
  const digits = digitsOf(draft.number);
  if (!draft.number.trim()) return { error: null, warning: null };
  if (/[^\d\s+().\-\/]/.test(draft.number)) return { error: 'Use digits only.', warning: null };
  if (digits.length < 6 || digits.length > 15) return { error: 'Enter a complete number (6–15 digits).', warning: null };
  if (draft.needsReview) return { error: null, warning: 'Imported number — please confirm the country.' };
  const v = draftToRowValues(draft);
  const parsed = v.e164 ? parsePhoneNumberFromString(v.e164) : undefined;
  if (!parsed?.isValid()) {
    return { error: null, warning: `This doesn't look like a valid ${countryName ?? 'phone'} number. Check the country.` };
  }
  return { error: null, warning: null };
}

/** "+91 98765 43210" for display; falls back to what was typed. */
export function formatPhone(p: { e164: string | null; rawInput?: string | null; nationalNumber: string }): string {
  if (p.e164) {
    const parsed = parsePhoneNumberFromString(p.e164);
    if (parsed) return parsed.formatInternational();
  }
  return p.rawInput || p.nationalNumber;
}

/** Number to dial / message: E.164 when known, otherwise the digits as typed. */
export const dialString = (p: { e164: string | null; nationalNumber: string }) => p.e164 ?? p.nationalNumber;

/** Converts OCR/legacy text ("98765 43210, +1 415…") into editable drafts. Unknown countries default to India but are flagged. */
export function textToPhoneDrafts(text: string | null | undefined, defaultCountry = 'IN'): PhoneDraft[] {
  return splitLegacyPhones(text).map((raw) => {
    const c = classifyPhone(raw);
    return {
      label: c.suggestedLabel,
      countryIso: c.countryIso ?? defaultCountry,
      number: c.countryIso ? c.nationalNumber : raw,
      needsReview: c.needsReview && !c.countryIso,
    };
  });
}

/** Turns a stored phone row back into an editable draft. */
export const phoneToDraft = (p: ContactPhone): PhoneDraft => ({
  id: p.id,
  label: p.label,
  countryIso: p.countryIso,
  number: p.countryIso ? p.nationalNumber : p.rawInput ?? p.nationalNumber,
  needsReview: p.needsReview,
});

/** Splits a legacy comma/semicolon separated field. */
export const splitLegacyList = (s: string | null | undefined): string[] =>
  (s ?? '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Legacy phone entries that contain at least one digit (entries like "ext." can't become a phone row). */
export const splitLegacyPhones = (s: string | null | undefined): string[] =>
  splitLegacyList(s).filter((p) => /\d/.test(p));

/** Comparison key so "+91 98765 43210" and "098765 43210" are the same number. */
export const phoneMatchKey = (s: string | null | undefined): string => digitsOf(s ?? '').slice(-10);
