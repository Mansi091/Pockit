import { Alert, Linking } from 'react-native';
import type { PermissionState } from '@/services/notificationService';

/** Explains (once per save) why a follow-up won't ring, without blocking the save. */
export function showPermissionHint(state: PermissionState) {
  if (state === 'denied') {
    Alert.alert(
      'Notifications are off',
      "The follow-up is saved and shows in Planner, but your phone won't alert you. You can turn notifications on for Pockit in Settings.",
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ],
    );
  } else if (state === 'unavailable') {
    Alert.alert('Saved', 'Reminder alerts need the Pockit app build (not Expo Go). The follow-up still shows in Planner.');
  }
}
