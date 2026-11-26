import { Platform } from 'react-native';
import { pickFromGalleryAndCrop, takePhotoAndCrop } from '@/services/cameraService';
import * as ImagePicker from 'expo-image-picker';
import { isDocumentScannerAvailable, scanCardAutomatically, scanCardsAutomatically } from '@/services/documentScannerService';
import { prepareImage } from '@/services/imageService';

/**
 * One place that knows how to get a card image, used for the front, the back,
 * and "Add back side" on an existing contact. Every path ends in prepareImage
 * (orientation baked in, size capped, JPEG). May throw ScannerUnavailableError
 * for 'auto' — callers offer the manual camera path instead.
 */
export type CaptureSource = 'auto' | 'camera' | 'gallery';

export interface CardImage {
  uri: string;
  width: number;
  height: number;
}

export const CAPTURE_LABEL: Record<CaptureSource, string> =
  Platform.OS === 'web'
    ? { auto: 'Scan with camera', camera: 'Scan with webcam', gallery: 'Upload a photo' }
    : { auto: 'Scan with camera (auto-crop)', camera: 'Take photo & crop myself', gallery: 'Choose from gallery' };

export function captureSources(): CaptureSource[] {
  return isDocumentScannerAvailable() ? ['auto', 'camera', 'gallery'] : ['camera', 'gallery'];
}

/** Resolves null when the user cancels. */
export async function captureCard(from: CaptureSource): Promise<CardImage | null> {
  const picked =
    from === 'auto' ? await scanCardAutomatically() : from === 'camera' ? await takePhotoAndCrop() : await pickFromGalleryAndCrop();
  if (!picked) return null;
  return prepareImage(picked.uri, { width: picked.width, height: picked.height });
}

/**
 * Batch capture: several cards at once.
 *  'scan'    → Google's scanner (phone build), up to 20 cards, each auto-cropped
 *  'gallery' → pick several photos (phone or website)
 * Every image is normalised with prepareImage. Resolves [] when cancelled.
 */
export type BatchSource = 'scan' | 'gallery';

export async function captureMany(from: BatchSource, max = 20): Promise<CardImage[]> {
  let picked: { uri: string; width: number; height: number }[] = [];
  if (from === 'scan') {
    picked = await scanCardsAutomatically(max);
  } else {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: max,
      quality: 1,
    });
    if (!result.canceled) picked = (result.assets ?? []).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
  }
  const out: CardImage[] = [];
  const selected = picked.slice(0, max);
  try {
    for (const p of selected) {
      out.push(await prepareImage(p.uri, { width: p.width, height: p.height }));
    }
  } finally {
    // The web image picker hands back temporary blob URLs. Normalized images
    // are self-contained data URLs, so release originals even if one fails.
    if (Platform.OS === 'web') {
      for (const p of picked) if (p.uri.startsWith('blob:')) URL.revokeObjectURL(p.uri);
    }
  }
  return out;
}
