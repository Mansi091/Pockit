import type { ContactField, ContactInput, OcrResult } from '@/types/contact';

/**
 * Holds the in-progress scan while the user moves Scan → Processing → Review.
 * Image URIs and OCR output are too large for route params, so screens share
 * them here. Cleared after save or cancel.
 *
 * P11: `back` is the optional reverse side. `targetContactId` is set when the
 * user adds a back side to a contact that already exists (no front image then).
 * P12: `queue` holds the remaining cards of a batch scan; `batch` counts them.
 */
type SessionImage = { uri: string; width: number; height: number };

interface BatchState {
  total: number;
  saved: number;
}

interface ScanSession {
  image: SessionImage | null;
  back: SessionImage | null;
  targetContactId: string | null;
  ocr: OcrResult | null;
  draft: ContactInput | null;
  lowConfidence: ContactField[];
  queue: SessionImage[];
  batch: BatchState | null;
}

const empty: ScanSession = {
  image: null,
  back: null,
  targetContactId: null,
  ocr: null,
  draft: null,
  lowConfidence: [],
  queue: [],
  batch: null,
};
let session: ScanSession = empty;

export const scanSession = {
  get: (): Readonly<ScanSession> => session,
  /** New or replaced front. Keeps an already captured back side. */
  setImage(image: SessionImage | null) {
    session = { ...empty, image, back: session.targetContactId ? null : session.back };
  },
  setBack(back: SessionImage | null) {
    session = { ...session, back, ocr: null, draft: null, lowConfidence: [] };
  },
  /** "Add back side" on an existing contact. */
  startBackOnly(contactId: string, back: SessionImage) {
    session = { ...empty, back, targetContactId: contactId };
  },
  setResult(ocr: OcrResult | null, draft: ContactInput, lowConfidence: ContactField[] = []) {
    session = { ...session, ocr, draft, lowConfidence };
  },

  // ── Batch (P12) ──
  startBatch(images: SessionImage[]) {
    const [first, ...rest] = images;
    session = { ...empty, image: first ?? null, queue: rest, batch: { total: images.length, saved: 0 } };
  },
  /** 1-based position of the card being reviewed, e.g. "Card 2 of 5". */
  batchPosition(): { index: number; total: number } | null {
    const b = session.batch;
    return b ? { index: b.total - session.queue.length, total: b.total } : null;
  },
  /** Moves to the next card. Returns false when the batch is finished. */
  nextInBatch(savedCurrent: boolean): boolean {
    const b = session.batch;
    if (!b) return false;
    const batch = { ...b, saved: b.saved + (savedCurrent ? 1 : 0) };
    const [next, ...rest] = session.queue;
    if (!next) {
      session = { ...session, batch };
      return false;
    }
    session = { ...empty, image: next, queue: rest, batch };
    return true;
  },

  clear() {
    session = empty;
  },
};
