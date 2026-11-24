import { requireSupabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/config/env';
import type { ExtractedFields, OcrResult } from '@/types/contact';

/**
 * Web version of ocrService.ts (same exports).
 *
 * ML Kit only exists on phones, so the web app sends the card image to OUR
 * Supabase Edge Function `scan-card` (supabase/functions/scan-card), which asks
 * Google Gemini to read it. The Gemini API key lives only in Supabase's
 * secrets — never in this browser code. Only signed-in users can call it.
 *
 * Privacy: on the web, card images leave the device (to Supabase → Google).
 * The phone app still reads cards on-device.
 */
export class OcrUnavailableError extends Error {
  constructor(message = 'Card reading is not set up on the server yet (scan-card function). You can enter the details manually.') {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

export const isOcrAvailable = (): boolean => isSupabaseConfigured;

interface ScanCardResponse {
  lines?: string[];
  fields?: Partial<ExtractedFields>;
  error?: string;
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};

export async function recognizeText(imageUri: string): Promise<OcrResult> {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(imageUri);
  if (!match) throw new Error('Unsupported image. Please pick a JPG or PNG photo.');
  const [, mimeType, base64] = match;
  if (base64!.length > 6_000_000) throw new Error('This image is too large. Try a smaller photo.');

  const { data, error } = await requireSupabase().functions.invoke<ScanCardResponse>('scan-card', {
    body: { image: base64, mimeType },
  });

  if (error) {
    // 404 → function not deployed; 500 with a config message → secret missing.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 404) throw new OcrUnavailableError();
    let detail = '';
    try {
      const body = await (error as { context?: Response }).context?.json?.();
      detail = body?.error ?? '';
    } catch {
      // no JSON body
    }
    if (/not configured/i.test(detail)) throw new OcrUnavailableError(detail);
    throw new Error(detail || 'Could not read the card. Check your internet connection and try again.');
  }

  const lines = (data?.lines ?? []).map((l) => String(l).trim()).filter(Boolean);
  const f = data?.fields ?? {};
  return {
    text: lines.join('\n'),
    lines: lines.map((text) => ({ text })),
    fields: {
      personName: clean(f.personName) ?? '',
      companyName: clean(f.companyName),
      designation: clean(f.designation),
      phone: clean(f.phone),
      email: clean(f.email),
      website: clean(f.website),
      address: clean(f.address),
    },
  };
}
