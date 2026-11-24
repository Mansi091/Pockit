import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { openCropper, openWebcam } from '@/web/scanner/webcam';

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
  return openCropper(result.assets[0]!.uri);
}
