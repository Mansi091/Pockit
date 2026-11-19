import { requireOptionalNativeModule } from 'expo';
import { isExpoGo } from '@/lib/runtime';
import { prepareImage } from '@/services/imageService';
import type { OcrLine, OcrResult } from '@/types/contact';

/**
 * On-device OCR using Google ML Kit Text Recognition v2 (Latin script) through
 * @infinitered/react-native-mlkit-text-recognition. Images never leave the phone.
 *
 * The native module only exists in a development/production build, NOT in
 * Expo Go, so it is required lazily and its absence surfaces as
 * OcrUnavailableError (the UI then offers manual entry).
 */
export class OcrUnavailableError extends Error {
  constructor() {
    super('On-device OCR needs the Pockit development build — it is not available in Expo Go.');
    this.name = 'OcrUnavailableError';
  }
}

interface MlkitRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface MlkitText {
  text: string;
  blocks: { text: string; frame: MlkitRect; lines: { text: string; frame: MlkitRect }[] }[];
}
type RecognizeFn = (imagePath: string) => Promise<MlkitText>;

let recognizer: RecognizeFn | null | undefined;

function loadRecognizer(): RecognizeFn | null {
  if (recognizer !== undefined) return recognizer;
  // Check the native side exists BEFORE requiring the JS package: requiring it
  // when the native module is missing (Expo Go) reports a fatal error in dev,
  // even inside try/catch.
  if (isExpoGo || !requireOptionalNativeModule('RNMLKitTextRecognition')) return (recognizer = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@infinitered/react-native-mlkit-text-recognition') as { recognizeText: RecognizeFn };
    recognizer = mod.recognizeText;
  } catch {
    recognizer = null;
  }
  return recognizer;
}

export const isOcrAvailable = (): boolean => loadRecognizer() !== null;

function toResult(raw: MlkitText, rotation: number): OcrResult {
  const lines: OcrLine[] = [];
  raw.blocks.forEach((block, blockIndex) => {
    for (const line of block.lines) {
      const text = line.text.trim();
      if (!text) continue;
      const f = line.frame;
      lines.push({
        text,
        blockIndex,
        frame: f ? { left: f.left, top: f.top, width: f.right - f.left, height: f.bottom - f.top } : undefined,
      });
    }
  });
  // Reading order: top-to-bottom, then left-to-right for lines on the same row.
  lines.sort((a, b) => {
    if (!a.frame || !b.frame) return 0;
    const sameRow = Math.abs(a.frame.top - b.frame.top) < Math.min(a.frame.height, b.frame.height) * 0.5;
    return sameRow ? a.frame.left - b.frame.left : a.frame.top - b.frame.top;
  });
  return { text: lines.map((l) => l.text).join('\n'), lines, rotation };
}

/** Rough readability score: alphanumeric characters recognised. */
const score = (r: OcrResult) => (r.text.match(/[A-Za-z0-9]/g) ?? []).length;
const GOOD_ENOUGH = 25;

/**
 * Recognises text. If the first pass finds little text the card may be
 * sideways/upside-down, so it retries at 90°, 270° and 180° and keeps the
 * best-scoring result.
 */
export async function recognizeText(imageUri: string, size?: { width: number; height: number }): Promise<OcrResult> {
  const recognize = loadRecognizer();
  if (!recognize) throw new OcrUnavailableError();

  let best = toResult(await recognize(imageUri), 0);
  if (score(best) >= GOOD_ENOUGH) return best;

  for (const rotation of [90, 270, 180]) {
    const rotated = await prepareImage(imageUri, { rotate: rotation, width: size?.width, height: size?.height });
    const candidate = toResult(await recognize(rotated.uri), rotation);
    if (score(candidate) > score(best)) best = candidate;
    if (score(best) >= GOOD_ENOUGH) break;
  }
  return best;
}
