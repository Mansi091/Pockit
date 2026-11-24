import { Platform } from 'react-native';
import { pickFromGalleryAndCrop, takePhotoAndCrop } from '@/services/cameraService';
import { isDocumentScannerAvailable, scanCardAutomatically } from '@/services/documentScannerService';
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
