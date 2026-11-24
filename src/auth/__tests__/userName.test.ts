import { firstNameOf, fullNameOf, normaliseName, validateAccountName } from '@/auth/userName';
import type { Session } from '@supabase/supabase-js';

const session = (meta: Record<string, unknown>) => ({ user: { user_metadata: meta, email: 'madgulemansi987@gmail.com' } }) as unknown as Session;

describe('account name', () => {
  it('uses the name the user entered, not the email', () => {
    expect(firstNameOf(session({ full_name: '  Mansi   Madgule ' }))).toBe('Mansi');
    expect(fullNameOf(session({ full_name: 'Mansi Madgule' }))).toBe('Mansi Madgule');
  });

  it('falls back to the name Google provides', () => {
    expect(firstNameOf(session({ name: 'Priya Nair' }))).toBe('Priya');
  });

  it('returns null (never the email) when no name was given', () => {
    expect(firstNameOf(session({}))).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it('cleans spaces but never touches letters (regression: "s" became a space)', () => {
    expect(normaliseName('  Aayush   Musale ')).toBe('Aayush Musale');
    expect(normaliseName('Mansi Madgule')).toBe('Mansi Madgule');
    expect(normaliseName('Sneha\tDesai')).toBe('Sneha Desai');
  });

  it('validates names', () => {
    expect(validateAccountName('  ')).toMatch(/Enter/);
    expect(validateAccountName('12345')).toMatch(/letters/);
    expect(validateAccountName('Mansi')).toBeNull();
    expect(validateAccountName('मानसी')).toBeNull(); // non-Latin names are fine
  });
});
