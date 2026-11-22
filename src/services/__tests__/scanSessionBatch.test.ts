import { scanSession } from '@/services/scanSession';

const img = (n: number) => ({ uri: `file:///card${n}.jpg`, width: 1000, height: 600 });

describe('scanSession batch (P12)', () => {
  beforeEach(() => scanSession.clear());

  it('walks through every card and counts the saved ones', () => {
    scanSession.startBatch([img(1), img(2), img(3)]);
    expect(scanSession.get().image?.uri).toBe('file:///card1.jpg');
    expect(scanSession.batchPosition()).toEqual({ index: 1, total: 3 });

    expect(scanSession.nextInBatch(true)).toBe(true); // saved #1
    expect(scanSession.get().image?.uri).toBe('file:///card2.jpg');
    expect(scanSession.batchPosition()).toEqual({ index: 2, total: 3 });

    expect(scanSession.nextInBatch(false)).toBe(true); // skipped #2
    expect(scanSession.batchPosition()).toEqual({ index: 3, total: 3 });

    expect(scanSession.nextInBatch(true)).toBe(false); // saved #3 → finished
    expect(scanSession.get().batch?.saved).toBe(2);
  });

  it('starting a new card drops the previous card’s OCR result', () => {
    scanSession.startBatch([img(1), img(2)]);
    scanSession.setResult({ text: 'x', lines: [] }, {
      personName: 'A', companyName: null, designation: null, phones: [], emails: [], website: null, address: null, cardImagePath: null, rawOcrText: null,
    });
    scanSession.nextInBatch(true);
    expect(scanSession.get().draft).toBeNull();
    expect(scanSession.get().ocr).toBeNull();
  });

  it('is not a batch for a normal single scan', () => {
    scanSession.setImage(img(1));
    expect(scanSession.batchPosition()).toBeNull();
    expect(scanSession.nextInBatch(true)).toBe(false);
  });
});
