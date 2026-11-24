import { extractPhonesFromLine, orderPhones } from '@/services/phoneExtraction';
import { extractContact } from '@/services/extractionService';
import {
  checkPhoneDraft,
  classifyPhone,
  dialString,
  draftToRowValues,
  extractedPhonesToDrafts,
  formatPhone,
  phoneToDraft,
  splitExtension,
} from '@/utils/phone';
import type { ContactPhone, OcrResult } from '@/types/contact';

const plain = (rows: string[]): OcrResult => ({ text: rows.join('\n'), lines: [] });
const draftsOf = (line: string) => extractedPhonesToDrafts(extractPhonesFromLine(line).phones);

describe('1. Indian mobile', () => {
  it('+91 9876543210 → Mobile, India', () => {
    const [d] = draftsOf('M: +91 9876543210');
    expect(d).toMatchObject({ label: 'mobile', countryIso: 'IN', number: '9876543210', needsReview: false });
  });
});

describe('2. Chennai landline with a "(D)" note: +91-44(D) 42235400', () => {
  const found = extractPhonesFromLine('+91-44(D) 42235400').phones;

  it('keeps every digit: the note is not part of the number', () => {
    expect(found).toHaveLength(1);
    expect(found[0]!.raw.replace(/\D/g, '')).toBe('914442235400');
  });

  it('reads country +91, area 44, subscriber 42235400, a landline (Direct line)', () => {
    const [d] = extractedPhonesToDrafts(found);
    expect(d).toMatchObject({ countryIso: 'IN', number: '4442235400', needsReview: false });
    expect(d!.label).toBe('direct'); // (D) = direct line; it is a landline number
    const row = draftToRowValues(d!);
    expect(row).toMatchObject({ callingCode: '91', nationalNumber: '4442235400', e164: '+914442235400' });
    expect(classifyPhone('+914442235400').suggestedLabel).toBe('landline');
    expect(formatPhone(row)).toBe('+91 44 4223 5400');
  });
});

describe('3–4. Indian landlines written with the trunk 0 (regression: never Korean)', () => {
  it.each([
    ['044 23456789', '+914423456789'], // Chennai
    ['033 2229 1234', '+913322291234'], // Kolkata
    ['020 2567 8900', '+912025678900'], // Pune
    ['0532 2461234', '+915322461234'], // Prayagraj
    ['0612 2234567', '+916122234567'], // Patna
  ])('%s → India landline', (input, e164) => {
    const c = classifyPhone(input);
    expect(c).toMatchObject({ countryIso: 'IN', e164, suggestedLabel: 'landline' });
  });

  it('through the whole OCR path too', () => {
    const { fields } = extractContact(plain(['Ravi Kumar', 'Tel: 044 2811 1234']));
    const [d] = extractedPhonesToDrafts(fields.phones!);
    expect(d).toMatchObject({ countryIso: 'IN', label: 'landline' });
  });
});

describe('5. International landlines (not forced into Indian rules)', () => {
  it.each([
    ['+44 20 7946 0958', 'GB'],
    ['+971 4 330 0000', 'AE'], // Dubai
    ['+65 6123 4567', 'SG'],
  ])('%s → %s landline', (input, iso) => {
    const [d] = draftsOf(`Tel: ${input}`);
    expect(d).toMatchObject({ countryIso: iso, label: 'landline', needsReview: false });
  });

  it('a US number (fixed line or mobile — unknowable) stays "other" for the user to set', () => {
    const [d] = draftsOf('+1 212 555 0100');
    expect(d).toMatchObject({ countryIso: 'US', label: 'other' });
  });
});

describe('6. Korean numbers', () => {
  it('explicit +82 landline', () => {
    expect(classifyPhone('+82 2 312 3456')).toMatchObject({ countryIso: 'KR', suggestedLabel: 'landline' });
  });
  it('short Korean landline written nationally (cannot be Indian)', () => {
    expect(classifyPhone('02-312-3456')).toMatchObject({ countryIso: 'KR' });
  });
  it('Korean mobile', () => {
    expect(classifyPhone('010-7421-1123')).toMatchObject({ countryIso: 'KR', suggestedLabel: 'mobile' });
  });
});

describe('7. Fax numbers are kept and typed Fax', () => {
  it('"Fax : +91 (7272) 228747, 227343" → two fax numbers, the second sharing the prefix', () => {
    const found = extractPhonesFromLine('Fax : +91 (7272) 228747, 227343').phones;
    expect(found.map((p) => p.label)).toEqual(['fax', 'fax']);
    expect(found.map((p) => p.raw.replace(/\D/g, ''))).toEqual(['917272228747', '917272227343']);
    const drafts = extractedPhonesToDrafts(found);
    expect(drafts.every((d) => d.countryIso === 'IN' && d.label === 'fax')).toBe(true);
  });
});

describe('8. Several numbers on one card', () => {
  it('each number takes the label printed before it', () => {
    const found = extractPhonesFromLine('T: 020 2567 8900 | M: 98765 43210').phones;
    expect(found.map((p) => p.label)).toEqual(['landline', 'mobile']);
  });

  it('a whole card: mobiles first, landlines next, fax last — none lost', () => {
    const { fields } = extractContact(
      plain([
        'Amit Awasthi',
        'Kirloskar Brothers Limited',
        'Mobile : +91 9617990369, 9755581873',
        'Fax : +91 (7272) 228747, 227343',
        '+91-44(D) 42235400',
      ]),
    );
    const drafts = extractedPhonesToDrafts(fields.phones!);
    expect(drafts.map((d) => d.label)).toEqual(['mobile', 'mobile', 'direct', 'fax', 'fax']);
    expect(drafts[0]).toMatchObject({ countryIso: 'IN', number: '9617990369' });
    expect(drafts[1]).toMatchObject({ countryIso: 'IN', number: '9755581873' });
  });

  it('a "mobile" label never turns a landline into a mobile', () => {
    const [d] = draftsOf('M: 020 2567 8900');
    expect(d!.label).toBe('landline');
  });

  it('drops exact duplicates', () => {
    expect(orderPhones([{ raw: '98765 43210', label: null, extension: null }, { raw: '+91 98765 43210', label: 'mobile', extension: null }])).toHaveLength(1);
  });
});

describe('9. Extensions', () => {
  it('"Tel: 022 4000 1234 Ext. 204" keeps the extension separate', () => {
    const [p] = extractPhonesFromLine('Tel: 022 4000 1234 Ext. 204').phones;
    expect(p).toMatchObject({ extension: '204' });
    expect(p!.raw.replace(/\D/g, '')).toBe('02240001234');
  });

  it('is stored, displayed and dialled correctly', () => {
    const row = draftToRowValues({ countryIso: 'IN', number: '022 4000 1234', extension: '204' });
    expect(row).toMatchObject({ e164: '+912240001234', extension: '204' });
    expect(formatPhone(row)).toBe('+91 22 4000 1234 ext. 204');
    expect(dialString(row)).toBe('+912240001234,204');
  });

  it('splits an extension written in a summary string', () => {
    expect(splitExtension('+91 22 4000 1234 ext. 204')).toEqual({ number: '+91 22 4000 1234', extension: '204' });
    expect(splitExtension('+91 98765 43210')).toEqual({ number: '+91 98765 43210', extension: null });
  });

  it('rejects a non-numeric extension', () => {
    expect(checkPhoneDraft({ countryIso: 'IN', number: '022 4000 1234', extension: '2a' }).error).toMatch(/Extension/);
  });
});

describe('10. Invalid and incomplete numbers', () => {
  it('ignores fragments that are too short and dates', () => {
    expect(extractPhonesFromLine('Room 2025, valid 12/05/2027').phones).toEqual([]);
  });
  it('a number without any country evidence is NOT guessed — the user confirms', () => {
    const c = classifyPhone('42235400');
    expect(c.countryIso).toBeNull();
    expect(c.needsReview).toBe(true);
  });
});

describe('11. Manual country correction', () => {
  it('choosing India for an unconfirmed number gives the right international number', () => {
    const [d] = draftsOf('Tel: 44 4223 5400'); // no +91, no 0 → unknown
    expect(d).toMatchObject({ countryIso: null, needsReview: true });
    const corrected = { ...d!, countryIso: 'IN', needsReview: false };
    expect(draftToRowValues(corrected)).toMatchObject({ countryIso: 'IN', e164: '+914442235400' });
    expect(checkPhoneDraft(corrected)).toEqual({ error: null, warning: null });
  });

  it('changing only the type never changes the country', () => {
    const [d] = draftsOf('+91 98765 43210');
    const relabelled = { ...d!, label: 'whatsapp' as const };
    expect(draftToRowValues(relabelled).countryIso).toBe('IN');
  });
});

describe('12. Save and load without losing digits', () => {
  it('round-trips number, country, type and extension', () => {
    const draft = { label: 'landline' as const, countryIso: 'IN', number: '044 4223 5400', extension: '12' };
    const v = draftToRowValues(draft);
    const stored: ContactPhone = {
      id: 'p1', contactId: 'c1', label: draft.label, countryIso: v.countryIso, callingCode: v.callingCode,
      nationalNumber: v.nationalNumber, e164: v.e164, rawInput: v.rawInput, needsReview: false,
      extension: v.extension, position: 0, createdAt: '', updatedAt: '',
    };
    expect(stored.nationalNumber).toBe('4442235400');
    expect(phoneToDraft(stored)).toMatchObject({ label: 'landline', countryIso: 'IN', number: '4442235400', extension: '12' });
  });
});
