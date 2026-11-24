import { useEffect, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { OcrUnavailableError, recognizeText } from '@/services/ocrService';
import { extractContact } from '@/services/extractionService';
import { draftFromExtraction, mergeBackSide } from '@/services/cardMerge';
import { createContact, findDuplicates } from '@/services/contactService';
import { getActiveEvent, recordFirstMeeting } from '@/services/activityService';
import type { ContactField, ContactInput, OcrResult } from '@/types/contact';

/**
 * Batch scanning (P12, reworked): capture many cards → see them all → every
 * card is read (OCR) automatically in the background → "Save all" or review
 * any card individually. State lives here (not in a screen) so the batch
 * survives opening the review form and coming back.
 *
 * Cards are read ONE AT A TIME on purpose: the phone's OCR is CPU-heavy and
 * the website's OCR (Gemini free tier) is rate-limited.
 */
export type BatchStatus = 'waiting' | 'reading' | 'ready' | 'failed' | 'saving' | 'saved';

export interface BatchImage {
  uri: string;
  width: number;
  height: number;
}

/** What one photo said (kept per side so a front/back pair can be split again without re-reading). */
export interface SideRead {
  ocr: OcrResult | null;
  draft: ContactInput;
  lowConfidence: ContactField[];
  /** No text reading on this device (e.g. Expo Go). */
  unavailable?: boolean;
}

export interface BatchItem {
  id: string;
  /** Front of the card. */
  image: BatchImage;
  /** Back of the same card, when the user joined two photos into one card. */
  back?: BatchImage;
  frontRead?: SideRead;
  backRead?: SideRead;
  status: BatchStatus;
  ocr?: OcrResult | null;
  /** The contact to save: the front, plus whatever only the back has. */
  draft?: ContactInput;
  lowConfidence?: ContactField[];
  /** Why "Save all" left this card for a manual check. */
  attention?: string;
  error?: string;
  contactId?: string;
}

const UNAVAILABLE = 'Text reading is not available here — enter the details.';

/** One contact from front (+ back): back-side details are added, never overwrite the front. */
export function combineSides(front: SideRead, back?: SideRead, backImage?: BatchImage): Pick<BatchItem, 'draft' | 'ocr' | 'lowConfidence'> {
  if (!back || !backImage) return { draft: { ...front.draft, cardBackImagePath: null }, ocr: front.ocr, lowConfidence: front.lowConfidence };
  const { merged } = mergeBackSide(front.draft, back.draft);
  return { draft: { ...merged, cardBackImagePath: backImage.uri }, ocr: front.ocr, lowConfidence: front.lowConfidence };
}

const busy = (i: BatchItem) => i.status === 'reading' || i.status === 'saving' || i.status === 'saved';

/** Can this card be joined to the one before it as its back side? */
export function canJoinWithPrevious(list: readonly BatchItem[], index: number): boolean {
  const item = list[index];
  const prev = list[index - 1];
  return !!item && !!prev && !item.back && !prev.back && !busy(item) && !busy(prev);
}

let items: BatchItem[] = [];
let running = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function update(id: string, patch: Partial<BatchItem>) {
  items = items.map((it) => (it.id === id ? { ...it, ...patch } : it));
  emit();
}

export const batchScan = {
  get: (): readonly BatchItem[] => items,
  find: (id: string) => items.find((i) => i.id === id),

  /** Starts a new batch and begins reading the cards. */
  start(images: BatchImage[]) {
    items = images.map((image) => ({ id: randomUUID(), image, status: 'waiting' as const }));
    emit();
    void runQueue();
  },

  /** Adds more cards to the current batch. */
  add(images: BatchImage[]) {
    items = [...items, ...images.map((image) => ({ id: randomUUID(), image, status: 'waiting' as const }))];
    emit();
    void runQueue();
  },

  remove(id: string) {
    items = items.filter((i) => i.id !== id);
    emit();
  },

  /**
   * "This photo is the back of the card before it": the two photos become ONE
   * card (one contact). Sides already read are combined straight away.
   */
  joinWithPrevious(id: string) {
    const index = items.findIndex((i) => i.id === id);
    if (index < 1 || !canJoinWithPrevious(items, index)) return;
    const back = items[index]!;
    const front = items[index - 1]!;
    const backRead = back.frontRead; // its own "front" read is now our back side
    const joined: BatchItem = {
      ...front,
      back: back.image,
      backRead,
      attention: undefined,
      error: undefined,
      ...(front.frontRead && backRead
        ? { status: 'ready' as const, ...combineSides(front.frontRead, backRead, back.image) }
        : { status: 'waiting' as const }),
    };
    items = items.flatMap((i, k) => (k === index ? [] : k === index - 1 ? [joined] : [i]));
    emit();
    void runQueue();
  },

  /** Undo a join: the back photo becomes its own card again. */
  separate(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item?.back || busy(item)) return;
    const front: BatchItem = {
      ...item,
      back: undefined,
      backRead: undefined,
      attention: undefined,
      ...(item.frontRead ? { status: 'ready' as const, ...combineSides(item.frontRead) } : { status: 'waiting' as const }),
    };
    const back: BatchItem = {
      id: randomUUID(),
      image: item.back,
      frontRead: item.backRead,
      ...(item.backRead ? { status: 'ready' as const, ...combineSides(item.backRead) } : { status: 'waiting' as const }),
    };
    items = items.flatMap((i) => (i.id === id ? [front, back] : [i]));
    emit();
    void runQueue();
  },

  retry(id: string) {
    update(id, { status: 'waiting', error: undefined });
    void runQueue();
  },

  /** Called by the review screen after the user saved this card. */
  markSaved(id: string, contactId: string) {
    update(id, { status: 'saved', contactId, attention: undefined });
  },

  /** The user edited the card on the review screen but went back without saving. */
  updateDraft(id: string, draft: ContactInput) {
    update(id, { draft });
  },

  clear() {
    items = [];
    emit();
  },

  /** Unsaved cards still in the batch (for the "leave?" warning). */
  unsavedCount: () => items.filter((i) => i.status !== 'saved').length,
};

/** Re-renders whenever the batch changes. */
export function useBatch(): readonly BatchItem[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return items;
}

/** Reads one photo. No OCR on this device → an empty draft to type in manually. */
async function readSide(img: BatchImage): Promise<SideRead> {
  try {
    const ocr = await recognizeText(img.uri, img);
    const extraction = ocr.fields
      ? { fields: ocr.fields, lowConfidence: [] as ContactField[] }
      : ocr.text.trim()
        ? extractContact(ocr)
        : null;
    return { ocr, draft: draftFromExtraction(extraction?.fields, img.uri, ocr.text), lowConfidence: extraction?.lowConfidence ?? [] };
  } catch (e) {
    if (e instanceof OcrUnavailableError) return { ocr: null, draft: draftFromExtraction(null, img.uri, null), lowConfidence: [], unavailable: true };
    throw e;
  }
}

/** Reads every waiting card (front, then back if it has one), one at a time. */
async function runQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === 'waiting');
      if (!next) break;
      update(next.id, { status: 'reading' });
      try {
        const frontRead = next.frontRead ?? (await readSide(next.image));
        const backRead = next.back ? (next.backRead ?? (await readSide(next.back))) : undefined;
        if (!items.some((i) => i.id === next.id)) continue; // removed while reading
        update(next.id, {
          status: 'ready',
          frontRead,
          backRead,
          ...combineSides(frontRead, backRead, next.back),
          attention: frontRead.unavailable ? UNAVAILABLE : undefined,
        });
      } catch (e) {
        if (!items.some((i) => i.id === next.id)) continue;
        update(next.id, { status: 'failed', error: e instanceof Error ? e.message : 'Could not read this card.' });
      }
    }
  } finally {
    running = false;
  }
}

/** Is this draft complete enough to save without a human look? */
export function needsAttention(item: BatchItem): string | null {
  const d = item.draft;
  if (!d) return 'Not read yet.';
  if (!d.personName.trim()) return 'No name was found — please check this card.';
  if (!d.phones.some((p) => /\d{6,}/.test(p.number.replace(/\D/g, ''))) && !d.emails.length) {
    return 'No phone number or email was found.';
  }
  return null;
}

/**
 * Saves every card that is read and complete. Cards with no name, no way to
 * contact, or a possible duplicate are left for the user to review.
 * In Event mode, saved cards are linked to the active event.
 */
export async function saveAllReady(): Promise<{ saved: number; needReview: number }> {
  const event = await getActiveEvent().catch(() => null);
  let saved = 0;
  let needReview = 0;
  for (const item of items.filter((i) => i.status === 'ready')) {
    const problem = needsAttention(item);
    if (problem) {
      update(item.id, { attention: problem });
      needReview += 1;
      continue;
    }
    const dupes = await findDuplicates(item.draft!).catch(() => []);
    if (dupes.length) {
      update(item.id, { attention: `Possible duplicate of ${dupes[0]!.contact.personName} — please check.` });
      needReview += 1;
      continue;
    }
    update(item.id, { status: 'saving' });
    try {
      const created = await createContact(item.draft!);
      if (event) await recordFirstMeeting(created.id, { eventId: event.id, note: null, followUp: null }).catch(() => null);
      update(item.id, { status: 'saved', contactId: created.id, attention: undefined });
      saved += 1;
    } catch (e) {
      update(item.id, { status: 'ready', attention: e instanceof Error ? e.message : 'Could not save.' });
      needReview += 1;
    }
  }
  return { saved, needReview };
}
