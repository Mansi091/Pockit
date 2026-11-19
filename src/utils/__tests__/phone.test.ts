import { classifyPhone, phoneMatchKey, splitLegacyPhones } from '@/utils/phone';

describe('classifyPhone (v2 migration rule: +91 only when confirmed Indian)', () => {
  it.each([
    ['+91 98765 43210', 'IN', '+919876543210'],
    ['0091 98200 12345', 'IN', '+919820012345'],
    ['919876543210', 'IN', '+919876543210'],
    ['98765 43210', 'IN', '+919876543210'],
    ['098765 43210', 'IN', '+919876543210'],
    ['020 2567 8900', 'IN', '+912025678900'],
    ['022 4000 1234', 'IN', '+912240001234'],
  ])('confirms %s as Indian', (input, iso, e164) => {
    const c = classifyPhone(input);
    expect(c.countryIso).toBe(iso);
    expect(c.callingCode).toBe('91');
    expect(c.e164).toBe(e164);
    expect(c.needsReview).toBe(false);
  });

  it('does NOT assume +91 for a US number written without a code', () => {
    // "(415) 555-0142" is technically a valid Indian landline — the trap this rule avoids.
    const c = classifyPhone('(415) 555-0142');
    expect(c.countryIso).toBeNull();
    expect(c.e164).toBeNull();
    expect(c.nationalNumber).toBe('4155550142');
    expect(c.needsReview).toBe(true);
  });

  it('keeps an explicit foreign code but flags it for review', () => {
    const c = classifyPhone('+1 415 555 0142');
    expect(c.countryIso).toBe('US');
    expect(c.e164).toBe('+14155550142');
    expect(c.needsReview).toBe(true);
  });

  it('flags numbers that are too short to identify', () => {
    const c = classifyPhone('12345');
    expect(c.needsReview).toBe(true);
    expect(c.countryIso).toBeNull();
    expect(c.rawInput).toBe('12345');
  });

  it('labels mobiles and landlines', () => {
    expect(classifyPhone('98765 43210').suggestedLabel).toBe('mobile');
    expect(classifyPhone('020 2567 8900').suggestedLabel).toBe('work');
  });

  it('splits legacy lists and drops entries without digits', () => {
    expect(splitLegacyPhones('+91 98765 43210, ext.; 020 2567 8900,')).toEqual(['+91 98765 43210', '020 2567 8900']);
  });

  it('matches the same number written differently', () => {
    expect(phoneMatchKey('+91 98765 43210')).toBe(phoneMatchKey('098765-43210'));
  });
});
