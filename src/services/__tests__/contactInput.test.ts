jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
jest.mock('@/database/db', () => ({ getDb: jest.fn(), getCurrentUserId: jest.fn() }));
jest.mock('@/services/syncService', () => ({ requestSync: jest.fn() }));

import { addressesFromText, cleanInput, summarise } from '@/services/contactService';
import type { ContactInput } from '@/types/contact';

const base: ContactInput = {
  personName: '  Rahul Sharma ',
  companyName: ' ',
  designation: 'Head of Operations',
  phones: [],
  emails: [],
  website: null,
  address: null,
  cardImagePath: null,
  rawOcrText: null,
};

describe('P8 contact input', () => {
  it('drops empty phone/email rows so a contact can be saved without them', () => {
    const c = cleanInput({
      ...base,
      phones: [{ label: 'mobile', countryIso: 'IN', number: '' }, { label: 'work', countryIso: 'IN', number: ' 98765 43210 ' }],
      emails: [{ label: 'work', address: '  ' }, { label: 'personal', address: ' Rahul@Everest.COM ' }],
    });
    expect(c.personName).toBe('Rahul Sharma');
    expect(c.companyName).toBeNull();
    expect(c.phones).toEqual([{ label: 'work', countryIso: 'IN', number: '98765 43210' }]);
    expect(c.emails).toEqual([{ label: 'personal', address: 'rahul@everest.com' }]);
  });

  it('keeps the legacy summary columns in step (expand phase)', () => {
    expect(
      summarise({
        phones: [
          { label: 'work', countryIso: 'IN', number: '98765 43210' },
          { label: 'personal', countryIso: 'AE', number: '050 123 4567' },
        ],
        emails: [{ label: 'work', address: 'a@b.com' }],
      }),
    ).toEqual({ phone: '+91 98765 43210, +971 50 123 4567', email: 'a@b.com', address: null });
    expect(summarise({ phones: [], emails: [] })).toEqual({ phone: null, email: null, address: null });
  });
});

describe('9. existing contacts with one address', () => {
  it('a contact saved before v4 (only the text column) keeps its address as one "Other" address', () => {
    const c = cleanInput({ ...base, address: 'Opp. Railway Station, Dewas - 455 001' });
    expect(c.addresses).toEqual([
      { label: 'other', fullAddress: 'Opp. Railway Station, Dewas - 455 001', city: 'Dewas', state: '', country: '', postalCode: '455001' },
    ]);
  });

  it('the address list wins over the old text, and empty rows are dropped', () => {
    const c = cleanInput({
      ...base,
      address: 'old text',
      addresses: [
        { label: 'registered', fullAddress: '5 Park Street, Kolkata 700016', city: 'Kolkata', state: '', country: '', postalCode: '700016' },
        { label: 'other', fullAddress: '   ', city: '', state: '', country: '', postalCode: '' },
      ],
    });
    expect(c.addresses.map((a) => a.label)).toEqual(['registered']);
  });

  it('the summary column lists every address', () => {
    expect(
      summarise({
        phones: [],
        emails: [],
        addresses: [
          { label: 'registered', fullAddress: 'A, Mumbai 400013', city: '', state: '', country: '', postalCode: '' },
          { label: 'factory', fullAddress: 'B, Pune 410501', city: '', state: '', country: '', postalCode: '' },
        ],
      }).address,
    ).toBe('A, Mumbai 400013 | B, Pune 410501');
  });

  it('turns the summary back into separate addresses', () => {
    expect(addressesFromText('A, Mumbai 400013 | B, Pune 410501').map((a) => a.postalCode)).toEqual(['400013', '410501']);
  });
});
