import type { Session } from '@supabase/supabase-js';

/**
 * The account holder's name lives in Supabase Auth user metadata (`full_name`),
 * so it is the same on the phone and on the website. Google sign-in fills
 * `full_name` / `name` itself.
 */
export function fullNameOf(session: Session | null | undefined): string | null {
  const m = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = [m.full_name, m.name, m.given_name].find((v) => typeof v === 'string' && v.trim());
  return raw ? (raw as string).trim().replace(/\s+/g, ' ') : null;
}

/** "Priya Sharma" → "Priya". null when the user hasn't given a name. */
export function firstNameOf(session: Session | null | undefined): string | null {
  return fullNameOf(session)?.split(' ')[0] ?? null;
}

export const MAX_NAME_LENGTH = 80;

/** "  Aayush   Musale " → "Aayush Musale" (trims, collapses runs of whitespace; letters untouched). */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateAccountName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter your name.';
  if (n.length > MAX_NAME_LENGTH) return `Keep it under ${MAX_NAME_LENGTH} characters.`;
  if (!/\p{L}/u.test(n)) return 'Use letters for your name.';
  return null;
}
