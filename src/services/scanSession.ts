import type { ContactField, ContactInput, OcrResult } from '@/types/contact';

/**
 * Holds the in-progress scan while the user moves Scan → Camera → Processing → Review.
 * Image URIs and OCR output are too large for route params, so screens share
 * them here. Cleared after save or cancel.
 */
interface ScanSession {
  image: { uri: string; width: number; height: number } | null;
  ocr: OcrResult | null;
  draft: ContactInput | null;
  lowConfidence: ContactField[];
}

const empty: ScanSession = { image: null, ocr: null, draft: null, lowConfidence: [] };
let session: ScanSession = empty;

export const scanSession = {
  get: (): Readonly<ScanSession> => session,
  setImage(image: { uri: string; width: number; height: number }) {
    session = { ...empty, image };
  },
  setResult(ocr: OcrResult | null, draft: ContactInput, lowConfidence: ContactField[] = []) {
    session = { ...session, ocr, draft, lowConfidence };
  },
  clear() {
    session = empty;
  },
};
