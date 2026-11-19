jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
jest.mock('@/database/db', () => ({ getDb: jest.fn(), getCurrentUserId: jest.fn() }));
jest.mock('@/services/syncService', () => ({ requestSync: jest.fn() }));

import { cleanInput, summarise } from '@/services/contactService';
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
    ).toEqual({ phone: '+91 98765 43210, +971 50 123 4567', email: 'a@b.com' });
    expect(summarise({ phones: [], emails: [] })).toEqual({ phone: null, email: null });
  });
});
