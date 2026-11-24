jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});
jest.mock('@/services/ocrService', () => ({
  OcrUnavailableError: class extends Error {},
  recognizeText: jest.fn(),
}));
jest.mock('@/services/contactService', () => ({ createContact: jest.fn(), findDuplicates: jest.fn(async () => []) }));
jest.mock('@/services/activityService', () => ({ getActiveEvent: jest.fn(), recordFirstMeeting: jest.fn() }));

import { batchScan, canJoinWithPrevious, combineSides, type SideRead } from '@/services/batchScan';
import type { ContactInput } from '@/types/contact';

const draft = (over: Partial<ContactInput>): ContactInput => ({
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
const side = (over: Partial<ContactInput>): SideRead => ({ ocr: null, draft: draft(over), lowConfidence: [] });
const img = (uri: string) => ({ uri, width: 100, height: 60 });

describe('front + back of one card in a batch', () => {
  const front = side({
    personName: 'Amol Chitnis',
    companyName: 'Reliable Autotech',
    phones: [{ label: 'mobile', countryIso: 'IN', number: '+91 98230 85262' }],
    cardImagePath: 'front.jpg',
    rawOcrText: 'FRONT',
  });
  const back = side({
    personName: 'Reliable Autotech Pvt. Ltd.', // company name on the back must NOT replace the person
    phones: [
      { label: 'mobile', countryIso: 'IN', number: '9823085262' }, // same number → not added twice
      { label: 'landline', countryIso: 'IN', number: '0253 6689929' },
    ],
    emails: [{ label: 'work', address: 'amol.chitnis@reliableautotech.com' }],
    website: 'ReliableAutotech.com',
    cardImagePath: 'back.jpg',
    rawOcrText: 'BACK',
  });

  it('one contact: front kept, back adds only what is new, back photo stored', () => {
    const { draft: d } = combineSides(front, back, img('back.jpg'));
    expect(d!.personName).toBe('Amol Chitnis');
    expect(d!.phones.map((p) => p.number)).toEqual(['+91 98230 85262', '0253 6689929']);
    expect(d!.emails.map((e) => e.address)).toEqual(['amol.chitnis@reliableautotech.com']);
    expect(d!.website).toBe('ReliableAutotech.com');
    expect(d!.cardImagePath).toBe('front.jpg');
    expect(d!.cardBackImagePath).toBe('back.jpg');
    expect(d!.rawOcrText).toContain('FRONT');
    expect(d!.rawOcrText).toContain('BACK');
  });

  it('joining two read photos makes one card; separating restores two without reading again', async () => {
    const { recognizeText } = jest.requireMock('@/services/ocrService') as { recognizeText: jest.Mock };
    recognizeText.mockImplementation(async (uri: string) => ({
      text: uri,
      lines: [],
      fields:
        uri === 'f.jpg'
          ? { personName: 'Amol Chitnis', companyName: 'Reliable', designation: null, phone: '+91 98230 85262', email: null, website: null, address: null }
          : { personName: '', companyName: null, designation: null, phone: null, email: 'amol@reliable.com', website: 'reliable.com', address: null },
    }));
    const settle = async () => {
      for (let i = 0; i < 50 && batchScan.get().some((x) => x.status === 'waiting' || x.status === 'reading'); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
    };

    batchScan.start([img('f.jpg'), img('b.jpg')]);
    await settle();
    expect(batchScan.get()).toHaveLength(2);
    expect(recognizeText).toHaveBeenCalledTimes(2);

    batchScan.joinWithPrevious(batchScan.get()[1]!.id);
    const [card] = batchScan.get();
    expect(batchScan.get()).toHaveLength(1);
    expect(card).toMatchObject({ status: 'ready', back: { uri: 'b.jpg' } });
    expect(card!.draft).toMatchObject({ personName: 'Amol Chitnis', website: 'reliable.com', cardImagePath: 'f.jpg', cardBackImagePath: 'b.jpg' });
    expect(card!.draft!.emails.map((e) => e.address)).toEqual(['amol@reliable.com']);

    batchScan.separate(card!.id);
    const [a, b] = batchScan.get();
    expect(batchScan.get()).toHaveLength(2);
    expect(a!.draft).toMatchObject({ personName: 'Amol Chitnis', cardBackImagePath: null });
    expect(a!.draft!.emails).toEqual([]);
    expect(b!.draft).toMatchObject({ website: 'reliable.com', cardImagePath: 'b.jpg' });
    expect(recognizeText).toHaveBeenCalledTimes(2); // no re-reading
    batchScan.clear();
  });
});

describe('canJoinWithPrevious', () => {
  const it_ = (status: string, back?: boolean) => ({ id: status, image: img('x'), status, ...(back ? { back: img('b') } : {}) });
  it('only from the second card on, never into a card that already has a back or is saved/reading', () => {
    expect(canJoinWithPrevious([it_('ready'), it_('ready')] as never, 1)).toBe(true);
    expect(canJoinWithPrevious([it_('ready')] as never, 0)).toBe(false);
    expect(canJoinWithPrevious([it_('ready', true), it_('ready')] as never, 1)).toBe(false);
    expect(canJoinWithPrevious([it_('saved'), it_('ready')] as never, 1)).toBe(false);
    expect(canJoinWithPrevious([it_('ready'), it_('reading')] as never, 1)).toBe(false);
    expect(canJoinWithPrevious([it_('waiting'), it_('failed')] as never, 1)).toBe(true);
  });
});
