import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Manual capture paths (fallback when the automatic document scanner isn't
 * available, e.g. in Expo Go or on devices without Google Play services).
 * Both open Android's crop screen, so the user can cut the photo down to
 * just the card by hand.
 */
export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export function showPermissionSettingsAlert(what: string) {
  Alert.alert(
    `${what} permission needed`,
    `Pockit needs ${what.toLowerCase()} access for this. You can enable it in system settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: () => Linking.openSettings() },
    ],
  );
}

const CROP_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true, // opens the system crop screen
  quality: 1,
};

function firstAsset(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0]!;
  return { uri: a.uri, width: a.width, height: a.height };
}

/** System camera → crop screen. Returns null if cancelled or permission denied. */
export async function takePhotoAndCrop(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain) showPermissionSettingsAlert('Camera');
    return null;
  }
  return firstAsset(await ImagePicker.launchCameraAsync(CROP_OPTIONS));
}

/**
 * System photo picker → crop screen. No permission prompt: Android's photo
 * picker grants access only to the image the user picks.
 */
export async function pickFromGalleryAndCrop(): Promise<PickedImage | null> {
  return firstAsset(await ImagePicker.launchImageLibraryAsync(CROP_OPTIONS));
}
