import {
  firstPhone,
  validateAccountEmail,
  validateEmail,
  validateNewPassword,
  validatePersonName,
  validatePhone,
} from '@/utils/validation';

describe('validation', () => {
  it('allows blank optional fields', () => {
    expect(validateEmail('')).toBeNull();
    expect(validatePhone('  ')).toBeNull();
  });

  it('validates single and multiple emails', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('a@b.co, c@d.in')).toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
    expect(validateEmail('a@b.co, nope')).not.toBeNull();
  });

  it('validates phone numbers by digit count', () => {
    expect(validatePhone('+91 98765 43210')).toBeNull();
    expect(validatePhone('(415) 555-0142, 022 4000 1234')).toBeNull();
    expect(validatePhone('12345')).not.toBeNull();
    expect(validatePhone('98765abc43210')).not.toBeNull();
  });

  it('requires a person name', () => {
    expect(validatePersonName('  ')).not.toBeNull();
    expect(validatePersonName('Priya')).toBeNull();
  });

  it('enforces account email and password rules', () => {
    expect(validateAccountEmail('')).not.toBeNull();
    expect(validateAccountEmail('me@example.com')).toBeNull();
    expect(validateNewPassword('short1')).not.toBeNull();
    expect(validateNewPassword('longpassword')).not.toBeNull();
    expect(validateNewPassword('longpassw0rd')).toBeNull();
  });

  it('extracts the first dialable number', () => {
    expect(firstPhone('+91 98765 43210, 020 2567 8900')).toBe('+919876543210');
    expect(firstPhone(null)).toBeNull();
  });
});
