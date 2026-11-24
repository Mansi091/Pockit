import { Image } from 'react-native';
import { hasNativeModule, isExpoGo } from '@/lib/runtime';

/**
 * Automatic card capture using Google ML Kit Document Scanner
 * (react-native-document-scanner-plugin). Google's own screen detects the
 * card's four corners, corrects perspective, lets the user drag the corners,
 * rotate, apply an enhance filter and retake — all on-device.
 *
 * LIMITATION (by design of the ML Kit scanner): only the final processed
 * image is returned. The original uncropped photo exists only inside Google's
 * review screen until the user confirms; Pockit never receives it.
 *
 * Needs a development/production build (native module) and Google Play
 * services. Not available in Expo Go — callers fall back to cameraService's
 * manual crop flow.
 */
export interface ScannedCard {
  uri: string;
  width: number;
  height: number;
}

export class ScannerUnavailableError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Automatic card scanning is not available on this device.');
    this.name = 'ScannerUnavailableError';
  }
}

export function isDocumentScannerAvailable(): boolean {
  // Check the native module BEFORE requiring the package (requiring it without
  // the native side reports a fatal error in development, even inside try/catch).
  return !isExpoGo && hasNativeModule('DocumentScanner');
}

const getSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
  );

/** Opens Google's scanner. Resolves null if the user cancels. */
export async function scanCardAutomatically(): Promise<ScannedCard | null> {
  const cards = await scanCardsAutomatically(1);
  return cards[0] ?? null;
}

/**
 * P12 batch scan: Google's scanner lets the user capture up to `max` cards in
 * one session (each auto-cropped). Resolves [] if the user cancels.
 */
export async function scanCardsAutomatically(max: number): Promise<ScannedCard[]> {
  if (!isDocumentScannerAvailable()) throw new ScannerUnavailableError();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentScanner = require('react-native-document-scanner-plugin').default as typeof import('react-native-document-scanner-plugin').default;

  let result;
  try {
    result = await DocumentScanner.scanDocument({ maxNumDocuments: max, croppedImageQuality: 95 });
  } catch (e) {
    // e.g. Google Play services missing/outdated, or the device doesn't meet ML Kit's requirements
    throw new ScannerUnavailableError(e instanceof Error ? e.message : undefined);
  }
  if (result.status !== 'success' || !result.scannedImages?.length) return [];

  return Promise.all(
    result.scannedImages.map(async (uri) => ({ uri, ...(await getSize(uri).catch(() => ({ width: 0, height: 0 }))) })),
  );
}
