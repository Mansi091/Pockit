import { BACK_SEPARATOR, describeAdded, draftFromExtraction, joinOcrText, mergeBackSide } from '@/services/cardMerge';
import type { ContactInput } from '@/types/contact';

const base = (over: Partial<ContactInput> = {}): ContactInput => ({
  personName: '',
  companyName: null,
  designation: null,
  phones: [],
  emails: [],
  website: null,
  address: null,
  cardImagePath: null,
  rawOcrText: null,
  ...over,
});

describe('draftFromExtraction', () => {
  it('builds phone and email drafts from comma-separated text', () => {
    const d = draftFromExtraction(
      { personName: 'Hemant Khurana', companyName: 'Everest', designation: 'CEO', phone: '+91 98672 99476', email: 'a@x.com, b@x.com', website: null, address: null },
      'file:///front.jpg',
      'raw',
    );
    expect(d.phones).toHaveLength(1);
    expect(d.phones[0]!.countryIso).toBe('IN');
    expect(d.emails.map((e) => e.label)).toEqual(['work', 'personal']);
    expect(d.cardImagePath).toBe('file:///front.jpg');
  });

  it('handles no extraction (manual entry)', () => {
    const d = draftFromExtraction(null, null, '   ');
    expect(d.personName).toBe('');
    expect(d.phones).toEqual([]);
    expect(d.rawOcrText).toBeNull();
  });
});

describe('mergeBackSide', () => {
  it('never overwrites what the front already has', () => {
    const front = base({ personName: 'Hemant Khurana', companyName: 'Everest', address: 'Mumbai' });
    const back = base({ personName: 'Everest Industries Ltd', companyName: 'Other Co', address: 'Pune office' });
    const { merged, added } = mergeBackSide(front, back);
    expect(merged.personName).toBe('Hemant Khurana');
    expect(merged.companyName).toBe('Everest');
    expect(merged.address).toBe('Mumbai');
    expect(added).toEqual([]);
  });

  it('fills empty fields from the back', () => {
    const { merged, added } = mergeBackSide(base({ personName: 'A' }), base({ address: 'Plot 4, Andheri East', website: 'everestind.com' }));
    expect(merged.address).toBe('Plot 4, Andheri East');
    expect(merged.website).toBe('everestind.com');
    expect(added).toEqual(['website', 'address']);
  });

  it('adds only new phone numbers, matching on the last 10 digits', () => {
    const front = base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '+91 98672 99476' }] });
    const back = base({
      phones: [
        { label: 'mobile', countryIso: 'IN', number: '9867299476' }, // same number, different format
        { label: 'office', countryIso: 'IN', number: '022 2345 6789' },
      ],
    });
    const { merged, added } = mergeBackSide(front, back);
    expect(merged.phones.map((p) => p.number)).toEqual(['+91 98672 99476', '022 2345 6789']);
    expect(added).toEqual(['phone']);
  });

  it('drops the empty placeholder phone row when the back adds numbers', () => {
    const front = base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '' }] });
    const back = base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '98765 43210' }] });
    expect(mergeBackSide(front, back).merged.phones.map((p) => p.number)).toEqual(['98765 43210']);
  });

  it('keeps existing phone ids (so edits update rows instead of re-creating them)', () => {
    const front = base({ phones: [{ id: 'p1', label: 'work', countryIso: 'IN', number: '98765 43210' }] });
    const { merged } = mergeBackSide(front, base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '91234 56789' }] }));
    expect(merged.phones[0]!.id).toBe('p1');
    expect(merged.phones[1]!.id).toBeUndefined();
  });

  it('adds only new emails, case-insensitively', () => {
    const front = base({ emails: [{ label: 'work', address: 'Hemant@everestind.com' }] });
    const back = base({ emails: [{ label: 'work', address: 'hemant@everestind.com' }, { label: 'work', address: 'info@everestind.com' }] });
    const { merged, added } = mergeBackSide(front, back);
    expect(merged.emails.map((e) => e.address)).toEqual(['Hemant@everestind.com', 'info@everestind.com']);
    expect(added).toEqual(['email']);
  });

  it('keeps the card image and joins the OCR text', () => {
    const { merged } = mergeBackSide(base({ cardImagePath: 'front.jpg', rawOcrText: 'FRONT' }), base({ rawOcrText: 'BACK' }));
    expect(merged.cardImagePath).toBe('front.jpg');
    expect(merged.rawOcrText).toBe(`FRONT${BACK_SEPARATOR}BACK`);
  });

  it('does not mutate its inputs', () => {
    const front = base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '98765 43210' }] });
    mergeBackSide(front, base({ phones: [{ label: 'mobile', countryIso: 'IN', number: '91234 56789' }] }));
    expect(front.phones).toHaveLength(1);
  });
});

describe('joinOcrText', () => {
  it('handles missing sides', () => {
    expect(joinOcrText(null, null)).toBeNull();
    expect(joinOcrText('F', '')).toBe('F');
    expect(joinOcrText('', 'B')).toBe('--- Back side ---\nB');
  });
  it('does not append the same back text twice', () => {
    const once = joinOcrText('F', 'B');
    expect(joinOcrText(once, 'B')).toBe(once);
  });
});

describe('describeAdded', () => {
  it('reads naturally', () => {
    expect(describeAdded([])).toBe('');
    expect(describeAdded(['phone'])).toBe('phone number');
    expect(describeAdded(['phone', 'email', 'address'])).toBe('phone number, email and address');
  });
});

describe('addresses on two-sided cards', () => {
  const addr = (label: 'registered' | 'factory' | 'other', fullAddress: string) => ({ label, fullAddress, city: '', state: '', country: '', postalCode: '' });

  it('adds back-side addresses the front does not have, never duplicates', () => {
    const front = base({ addresses: [addr('registered', '5 Park Street, Kolkata 700016')] });
    const back = base({ addresses: [addr('registered', '5 Park Street, Kolkata - 700016'), addr('factory', 'Plot 4, Hosur 635109')] });
    const { merged, added } = mergeBackSide(front, back);
    expect(merged.addresses!.map((a) => a.label)).toEqual(['registered', 'factory']);
    expect(merged.address).toBe('5 Park Street, Kolkata 700016 | Plot 4, Hosur 635109');
    expect(added).toContain('address');
  });

  it('structured extraction keeps each address and phone type', () => {
    const d = draftFromExtraction(
      {
        personName: 'A', companyName: null, designation: null, phone: null, email: null, website: null, address: null,
        phones: [{ raw: '+91-44 42235400', label: 'direct', extension: null }, { raw: '+91 22 4000 9999', label: 'fax', extension: null }],
        addresses: [
          { label: 'registered', fullAddress: '5 Park Street, Kolkata 700016', city: 'Kolkata', state: null, country: null, postalCode: '700016' },
          { label: 'factory', fullAddress: 'Plot 4, Hosur 635109', city: 'Hosur', state: null, country: null, postalCode: '635109' },
        ],
      },
      null,
      null,
    );
    expect(d.phones.map((p) => p.label)).toEqual(['direct', 'fax']);
    expect(d.addresses!.map((a) => a.label)).toEqual(['registered', 'factory']);
    expect(d.addresses![0]).toMatchObject({ city: 'Kolkata', postalCode: '700016', state: '' });
  });
});
