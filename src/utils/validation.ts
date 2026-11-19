/**
 * Field validation for forms. Blank optional fields are valid — users may
 * save incomplete contacts. Only a person name is mandatory.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_RE = /^[+\d\s().\-\/]+$/;

const parts = (v: string) =>
  v
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Accepts one or more addresses separated by "," or ";". */
export function validateEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return parts(v).every((p) => EMAIL_RE.test(p)) ? null : 'Enter a valid email address.';
}

/** Accepts one or more numbers separated by "," or ";". Each needs 7–15 digits. */
export function validatePhone(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  for (const part of parts(v)) {
    const digits = part.replace(/\D/g, '');
    if (!PHONE_ALLOWED_RE.test(part) || digits.length < 7 || digits.length > 15) {
      return 'Enter a valid phone number (7–15 digits).';
    }
  }
  return null;
}

export function validatePersonName(value: string | null | undefined): string | null {
  return (value ?? '').trim() ? null : 'Person name is required.';
}

/** Account email: exactly one address, required. */
export function validateAccountEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Email is required.';
  return EMAIL_RE.test(v) ? null : 'Enter a valid email address.';
}

export function validateNewPassword(value: string): string | null {
  if (value.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number.';
  return null;
}

/** First number from a possibly multi-number field — used for the Call action. */
export function firstPhone(value: string | null | undefined): string | null {
  const first = (value ?? '').split(/[,;]/)[0]?.trim();
  return first ? first.replace(/[^\d+]/g, '') : null;
}

export function firstEmail(value: string | null | undefined): string | null {
  return (value ?? '').split(/[,;]/)[0]?.trim() || null;
}
