import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True inside the Expo Go app. Expo Go only contains Expo's bundled native
 * modules, so ML Kit OCR and native Google Sign-In are unavailable there and
 * must be loaded lazily (see ocrService / googleAuth).
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Is a React Native native module (not an Expo module) installed in this build?
 * Always false in the browser: React Native Web has no native modules and no
 * TurboModuleRegistry at all (calling it crashes the website).
 */
export function hasNativeModule(name: string): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry?.get?.(name) != null || NativeModules?.[name] != null;
  } catch {
    return false;
  }
}
