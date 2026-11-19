import { checkPhoneDraft, dialString, draftToRowValues, formatPhone, phoneToDraft, textToPhoneDrafts } from '@/utils/phone';
import { COUNTRIES, countryByIso, flagOf } from '@/data/countries';
import type { ContactPhone } from '@/types/contact';

describe('P8 phone drafts', () => {
  it('stores country, calling code, national number and E.164 for a chosen country', () => {
    expect(draftToRowValues({ countryIso: 'IN', number: '98765 43210' })).toEqual({
      countryIso: 'IN',
      callingCode: '91',
      nationalNumber: '9876543210',
      e164: '+919876543210',
      rawInput: '98765 43210',
    });
    expect(draftToRowValues({ countryIso: 'AE', number: '050 123 4567' })).toMatchObject({ callingCode: '971', e164: '+971501234567' });
  });

  it('lets a typed "+" code win over the dropdown', () => {
    expect(draftToRowValues({ countryIso: 'IN', number: '+1 415 555 0142' })).toMatchObject({ countryIso: 'US', e164: '+14155550142' });
  });

  it('keeps digits as typed when the country is unknown', () => {
    expect(draftToRowValues({ countryIso: null, number: '(415) 555-0142' })).toMatchObject({ countryIso: null, e164: null, nationalNumber: '4155550142' });
  });

  it('blocks clearly broken numbers but only warns about unusual ones', () => {
    expect(checkPhoneDraft({ countryIso: 'IN', number: '' })).toEqual({ error: null, warning: null });
    expect(checkPhoneDraft({ countryIso: 'IN', number: '123' }).error).toMatch(/6–15 digits/);
    expect(checkPhoneDraft({ countryIso: 'IN', number: '98765abc' }).error).toMatch(/digits only/);
    const unusual = checkPhoneDraft({ countryIso: 'IN', number: '55555 55555' }, 'India');
    expect(unusual.error).toBeNull();
    expect(unusual.warning).toMatch(/valid India number/);
    expect(checkPhoneDraft({ countryIso: 'IN', number: '98765 43210' })).toEqual({ error: null, warning: null });
    expect(checkPhoneDraft({ countryIso: 'IN', number: '4155550142', needsReview: true }).warning).toMatch(/confirm the country/);
  });

  it('turns OCR text into labelled drafts, flagging numbers whose country is unproven', () => {
    const drafts = textToPhoneDrafts('+91 98765 43210, 020 2567 8900, (415) 555-0142, +1 415 555 0142');
    expect(drafts).toEqual([
      { label: 'mobile', countryIso: 'IN', number: '9876543210', needsReview: false },
      { label: 'work', countryIso: 'IN', number: '2025678900', needsReview: false },
      { label: 'other', countryIso: 'IN', number: '(415) 555-0142', needsReview: true },
      { label: 'other', countryIso: 'US', number: '4155550142', needsReview: false }, // US: can't tell mobile from landline
    ]);
  });

  it('formats for display and dialling', () => {
    expect(formatPhone({ e164: '+919876543210', nationalNumber: '9876543210' })).toBe('+91 98765 43210');
    expect(formatPhone({ e164: null, rawInput: '(415) 555-0142', nationalNumber: '4155550142' })).toBe('(415) 555-0142');
    expect(dialString({ e164: null, nationalNumber: '4155550142' })).toBe('4155550142');
  });

  it('round-trips a stored row back into an editable draft', () => {
    const row: ContactPhone = {
      id: 'p1', contactId: 'c1', label: 'personal', countryIso: 'IN', callingCode: '91', nationalNumber: '9876543210',
      e164: '+919876543210', rawInput: '98765 43210', needsReview: false, position: 0, createdAt: '', updatedAt: '',
    };
    expect(phoneToDraft(row)).toEqual({ id: 'p1', label: 'personal', countryIso: 'IN', number: '9876543210', needsReview: false });
  });
});

describe('country list', () => {
  it('covers the world, with India +91 and emoji flags', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(countryByIso('IN')).toEqual({ iso: 'IN', name: 'India', callingCode: '91' });
    expect(flagOf('IN')).toBe('🇮🇳');
    expect(flagOf(null)).toBe('🌐');
  });
});
