jest.mock('@/services/ocrService', () => ({ recognizeText: jest.fn(), OcrUnavailableError: class extends Error {} }));
jest.mock('@/services/contactService', () => ({ createContact: jest.fn(), findDuplicates: jest.fn() }));
jest.mock('@/services/activityService', () => ({ getActiveEvent: jest.fn(), recordFirstMeeting: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));

import { needsAttention, type BatchItem } from '@/services/batchScan';

const item = (draft: Partial<NonNullable<BatchItem['draft']>> | null): BatchItem => ({
  id: 'x',
  image: { uri: 'file:///c.jpg', width: 1, height: 1 },
  status: 'ready',
  draft: draft
    ? {
        personName: '',
        companyName: null,
        designation: null,
        phones: [],
        emails: [],
        website: null,
        address: null,
        cardImagePath: null,
        rawOcrText: null,
        ...draft,
      }
    : undefined,
});

describe('batch "Save all" rules', () => {
  it('saves a card with a name and a phone', () => {
    expect(needsAttention(item({ personName: 'Amit Awasthi', phones: [{ label: 'mobile', countryIso: 'IN', number: '9617990369' }] }))).toBeNull();
  });
  it('saves a card with a name and only an email', () => {
    expect(needsAttention(item({ personName: 'Amit Awasthi', emails: [{ label: 'work', address: 'amit@kbl.co.in' }] }))).toBeNull();
  });
  it('holds back cards without a name', () => {
    expect(needsAttention(item({ phones: [{ label: 'mobile', countryIso: 'IN', number: '9617990369' }] }))).toMatch(/name/);
  });
  it('holds back cards with no way to contact the person', () => {
    expect(needsAttention(item({ personName: 'Amit Awasthi' }))).toMatch(/phone number or email/);
  });
  it('holds back cards not read yet', () => {
    expect(needsAttention(item(null))).toMatch(/Not read/);
  });
});
