import { useEffect, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { OcrUnavailableError, recognizeText } from '@/services/ocrService';
import { extractContact } from '@/services/extractionService';
import { draftFromExtraction } from '@/services/cardMerge';
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

export interface BatchItem {
  id: string;
  image: BatchImage;
  status: BatchStatus;
  ocr?: OcrResult | null;
  draft?: ContactInput;
  lowConfidence?: ContactField[];
  /** Why "Save all" left this card for a manual check. */
  attention?: string;
  error?: string;
  contactId?: string;
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

/** Reads every waiting card, one at a time. */
async function runQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === 'waiting');
      if (!next) break;
      update(next.id, { status: 'reading' });
      try {
        const ocr = await recognizeText(next.image.uri, next.image);
        const extraction = ocr.fields
          ? { fields: ocr.fields, lowConfidence: [] as ContactField[] }
          : ocr.text.trim()
            ? extractContact(ocr)
            : null;
        const draft = draftFromExtraction(extraction?.fields, next.image.uri, ocr.text);
        if (!items.some((i) => i.id === next.id)) continue; // removed while reading
        update(next.id, { status: 'ready', ocr, draft, lowConfidence: extraction?.lowConfidence ?? [] });
      } catch (e) {
        if (!items.some((i) => i.id === next.id)) continue;
        // No OCR on this device (e.g. Expo Go): keep the card so it can be typed in manually.
        if (e instanceof OcrUnavailableError) {
          update(next.id, {
            status: 'ready',
            ocr: null,
            draft: draftFromExtraction(null, next.image.uri, null),
            attention: 'Text reading is not available here — enter the details.',
          });
        } else {
          update(next.id, { status: 'failed', error: e instanceof Error ? e.message : 'Could not read this card.' });
        }
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
