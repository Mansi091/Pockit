import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { openCropper, openWebcam } from '@/web/scanner/webcam';
import { prepareImage } from '@/web/overrides/services/imageService';

/**
 * Web version of cameraService.ts (same exports).
 *  • "camera"  → our live webcam scanner (web/components/WebCardScanner): finds the
 *                card automatically, then lets the user fine-tune the corners.
 *  • "gallery" → the browser's file picker, then the same corner adjuster
 *                (card auto-detected first).
 */
export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export function showPermissionSettingsAlert(what: string) {
  Alert.alert(`${what} access is blocked`, `Allow ${what.toLowerCase()} access for this site in your browser's address bar, then try again.`);
}

export async function takePhotoAndCrop(): Promise<PickedImage | null> {
  return openWebcam();
}

export async function pickFromGalleryAndCrop(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const source = result.assets[0]!.uri;
  try {
    // Decode/re-encode before the crop UI. This handles Safari blob URLs and
    // HEIC/HEIF whenever Safari can decode them, and makes unsupported files
    // fail here with an actionable message instead of reaching OCR as blob:.
    const normalized = await prepareImage(source, { maxDimension: 2400, compress: 0.92 });
    return await openCropper(normalized.uri);
  } finally {
    // expo-image-picker creates an object URL for selected files on the web.
    // We have our own JPEG data URL now; release the picker URL on success/cancel/error.
    if (source.startsWith('blob:')) URL.revokeObjectURL(source);
  }
}
