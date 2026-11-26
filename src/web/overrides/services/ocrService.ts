import { requireSupabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/config/env';
import type { ExtractedFields, OcrResult } from '@/types/contact';
import { ImagePreparationError, prepareImage } from '@/web/overrides/services/imageService';

/** Web OCR uses Gemini through our authenticated Supabase Edge Function. */
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
  code?: string;
}

const MAX_BASE64_LENGTH = 5_500_000;
const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

/** Normalize blob:, data:, and browser file URLs to bounded JPEG before network use. */
async function asSendableJpeg(imageUri: string): Promise<string> {
  const prepared = await prepareImage(imageUri, {
    maxDimension: 2000,
    compress: 0.88,
    maxBase64Length: MAX_BASE64_LENGTH,
  });
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/i.test(prepared.uri)) {
    throw new ImagePreparationError('jpeg', 'The photo could not be converted to JPEG. Please export it as JPEG and try again.');
  }
  return prepared.uri;
}

export async function recognizeText(imageUri: string): Promise<OcrResult> {
  let jpegDataUrl: string;
  try {
    jpegDataUrl = await asSendableJpeg(imageUri);
  } catch (error) {
    if (error instanceof ImagePreparationError) {
      // Log only stage and URI scheme. Never log the URI, image, or card contents.
      console.warn('[Pockit OCR] image preparation failed', {
        stage: error.stage,
        source: imageUri?.startsWith('blob:') ? 'blob' : imageUri?.startsWith('data:') ? 'data' : 'url',
      });
      throw error;
    }
    console.warn('[Pockit OCR] image preparation failed', { stage: 'unknown' });
    throw new ImagePreparationError('loading', 'Could not prepare this photo. Please choose it again or export it as JPEG.');
  }

  const match = /^data:(image\/jpeg);base64,([A-Za-z0-9+/]+=*)$/i.exec(jpegDataUrl);
  if (!match) throw new ImagePreparationError('jpeg', 'The photo was not converted to a valid JPEG. Please choose another image.');
  const [, mimeType, base64] = match;
  if (base64!.length > MAX_BASE64_LENGTH) {
    throw new ImagePreparationError('jpeg', 'This photo is too large to send. Crop closer to the card and try again.');
  }

  let data: ScanCardResponse | null;
  let error: { context?: { status?: number; json?: () => Promise<unknown> }; message?: string } | null;
  try {
    ({ data, error } = await requireSupabase().functions.invoke<ScanCardResponse>('scan-card', {
      body: { image: base64, mimeType },
    }));
  } catch {
    console.warn('[Pockit OCR] Edge Function invocation failed', { stage: 'network' });
    throw new Error('Could not contact the card-reading service. Check your connection and try again.');
  }

  if (error) {
    const status = error.context?.status;
    console.warn('[Pockit OCR] Edge Function returned an error', { status: status ?? 'unknown' });
    if (status === 404) throw new OcrUnavailableError();
    if (status === 401 || status === 403) throw new Error('Your sign-in may have expired. Sign in again, then retry the scan.');
    if (status === 413) throw new Error('This photo is too large for the card-reading service. Crop closer to the card and retry.');

    let detail = '';
    try {
      const body = await error.context?.json?.();
      detail = (body as { error?: string } | null)?.error ?? '';
    } catch {
      // No JSON error body.
    }
    if (/not configured/i.test(detail)) throw new OcrUnavailableError(detail);
    throw new Error(detail || 'Could not read the card. Check your internet connection and try again.');
  }

  if (!data || data.error) {
    console.warn('[Pockit OCR] Edge Function returned no usable result', { code: data?.code ?? 'empty' });
    throw new Error(data?.error || 'The card-reading service returned no result. Please try again.');
  }

  const lines = (Array.isArray(data.lines) ? data.lines : []).map((line) => String(line).trim()).filter(Boolean);
  const fields = data.fields ?? {};
  return {
    text: lines.join('\n'),
    lines: lines.map((text) => ({ text })),
    fields: {
      personName: clean(fields.personName) ?? '',
      companyName: clean(fields.companyName),
      designation: clean(fields.designation),
      phone: clean(fields.phone),
      email: clean(fields.email),
      website: clean(fields.website),
      address: clean(fields.address),
      ...(Array.isArray(fields.phones) ? { phones: fields.phones } : {}),
      ...(Array.isArray(fields.addresses) ? { addresses: fields.addresses } : {}),
    },
  };
}
