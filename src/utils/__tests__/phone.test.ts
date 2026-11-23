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

  it('detects a formatted US number without assuming +91', () => {
    const c = classifyPhone('(415) 555-0142');
    expect(c.countryIso).toBe('US');
    expect(c.e164).toBe('+14155550142');
    expect(c.nationalNumber).toBe('4155550142');
    expect(c.needsReview).toBe(false);
  });

  it('detects an explicit foreign code automatically', () => {
    const c = classifyPhone('+1 415 555 0142');
    expect(c.countryIso).toBe('US');
    expect(c.e164).toBe('+14155550142');
    expect(c.needsReview).toBe(false);
  });

  it('detects South Korean 010 and area-code numbers', () => {
    expect(classifyPhone('010-7421-1123')).toMatchObject({
      countryIso: 'KR',
      callingCode: '82',
      e164: '+821074211123',
      needsReview: false,
    });
    expect(classifyPhone('(053) 324-9001')).toMatchObject({
      countryIso: 'KR',
      callingCode: '82',
      e164: '+82533249001',
      needsReview: false,
    });
  });

  it('keeps Indian landlines Indian even when the STD code looks Korean', () => {
    // Regression: these were detected as South Korea (+82).
    for (const [n, e164] of [
      ['033 2229 1234', '+913322291234'], // Kolkata
      ['044 2811 1234', '+914428111234'], // Chennai
      ['0532 2461234', '+915322461234'], // Prayagraj
      ['0612 2234567', '+916122234567'], // Patna
      ['0431 2412345', '+914312412345'], // Tiruchirappalli
      ['022 2345 6789', '+912223456789'], // Mumbai
    ] as const) {
      expect(classifyPhone(n)).toMatchObject({ countryIso: 'IN', e164 });
    }
  });

  it('still detects shorter Korean landlines (they cannot be Indian)', () => {
    expect(classifyPhone('02-123-4567')).toMatchObject({ countryIso: 'KR' }); // Seoul, 9 digits
    expect(classifyPhone('(053) 324-9001')).toMatchObject({ countryIso: 'KR' }); // Daegu, 10 digits
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
