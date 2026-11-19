import type { ContactField, ContactInput, OcrResult } from '@/types/contact';

/**
 * Holds the in-progress scan while the user moves Scan → Processing → Review.
 * Image URIs and OCR output are too large for route params, so screens share
 * them here. Cleared after save or cancel.
 *
 * P11: `back` is the optional reverse side. `targetContactId` is set when the
 * user adds a back side to a contact that already exists (no front image then).
 */
type SessionImage = { uri: string; width: number; height: number };

interface ScanSession {
  image: SessionImage | null;
  back: SessionImage | null;
  targetContactId: string | null;
  ocr: OcrResult | null;
  draft: ContactInput | null;
  lowConfidence: ContactField[];
}

const empty: ScanSession = { image: null, back: null, targetContactId: null, ocr: null, draft: null, lowConfidence: [] };
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
  clear() {
    session = empty;
  },
};
