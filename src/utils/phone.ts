import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import type { ContactPhone, PhoneDraft, PhoneLabel } from '@/types/contact';

/**
 * Phone-number classification shared by OCR, drafts and the SQLite migration.
 * Explicit international prefixes are authoritative. National numbers are
 * inferred only from formats that are identifiable, for example Indian 10-digit
 * mobiles and South Korean 010/area-code numbers. Ambiguous numbers stay
 * unassigned instead of silently becoming Indian.
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
    const result = fromParsed(rawInput, p, false);
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

  // 4. South Korean mobile and geographic numbers.
  // This prevents "(053) 324-9001" and "010-7421-1123" from becoming Indian.
  if (/^010\d{7,8}$/.test(digits)) {
    const p = parsePhoneNumberFromString(digits, 'KR');
    if (p?.isValid()) return fromParsed(rawInput, p, false)!;
  }
  if (/^0(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/.test(digits)) {
    const kr = parsePhoneNumberFromString(digits, 'KR');
    if (kr?.isValid()) return fromParsed(rawInput, kr, false)!;
  }

  // 5. Indian landline written with its STD trunk "0"
  if (digits.startsWith('0')) {
    const p = parsePhoneNumberFromString(digits, 'IN');
    if (p?.isValid()) return fromParsed(rawInput, p, false)!;
  }

  // 6. US/Canada national numbers when the formatting makes this identifiable.
  if (/^\s*\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}\s*$/.test(rawInput)) {
    const p = parsePhoneNumberFromString(digits, 'US');
    if (p?.isValid()) return fromParsed(rawInput, p, false)!;
  }
  if (/^1\d{10}$/.test(digits)) {
    const p = parsePhoneNumberFromString(digits, 'US');
    if (p?.isValid()) return fromParsed(rawInput, p, false)!;
  }

  // 7. No proof of country → keep as typed, ask the user.
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
  const digits = digitsOf(raw);
  const explicitInternational =
    raw.startsWith('+')
      ? raw
      : digits.startsWith('00')
        ? `+${digits.slice(2)}`
        : null;
  const parsed = explicitInternational
    ? parsePhoneNumberFromString(explicitInternational)
    : raw.startsWith('+')
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

/**
 * OCR often reads the "+" of "+91 98672 99476" as a "4" → "491 9867299476".
 * If the digits are NOT a valid number as written but become a valid
 * international number once the leading 4 is treated as "+", return that.
 */
export function fixMisreadPlus(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (trimmed.startsWith('+')) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits.startsWith('4') || digits.length < 10) return null;
  const asWritten = parsePhoneNumberFromString(digits, 'IN');
  if (asWritten?.isValid()) return null;
  const fixed = parsePhoneNumberFromString(`+${digits.slice(1)}`);
  return fixed?.isValid() ? fixed.formatInternational() : null;
}

/** Converts OCR/legacy text ("98765 43210, +1 415…") into editable drafts. */
export function textToPhoneDrafts(text: string | null | undefined, defaultCountry: string | null = null): PhoneDraft[] {
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
