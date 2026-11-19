import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True inside the Expo Go app. Expo Go only contains Expo's bundled native
 * modules, so ML Kit OCR and native Google Sign-In are unavailable there and
 * must be loaded lazily (see ocrService / googleAuth).
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
