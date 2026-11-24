import { env, isGoogleConfigured } from '@/config/env';
import { hasNativeModule, isExpoGo } from '@/lib/runtime';

/**
 * Native "Continue with Google" via @react-native-google-signin/google-signin.
 * Returns a Google ID token that Supabase verifies (signInWithIdToken).
 *
 * Needs a development/production build (native module) AND Google Cloud OAuth
 * clients — see docs/SETUP.md. In Expo Go, or without EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
 * `isGoogleSignInAvailable` is false and the button is hidden.
 */
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let mod: GoogleModule | null | undefined;
function load(): GoogleModule | null {
  if (mod !== undefined) return mod;
  // Check the native TurboModule exists before requiring the package (see ocrService).
  if (isExpoGo || !isGoogleConfigured || !hasNativeModule('RNGoogleSignin')) return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin') as GoogleModule;
    mod.GoogleSignin.configure({ webClientId: env.googleWebClientId });
  } catch {
    mod = null;
  }
  return mod;
}

export const isGoogleSignInAvailable = (): boolean => load() !== null;

export class GoogleSignInCancelled extends Error {}

export async function getGoogleIdToken(): Promise<string> {
  const g = load();
  if (!g) throw new Error('Google sign-in is not available in this build.');
  try {
    await g.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await g.GoogleSignin.signIn();
    if (!g.isSuccessResponse(response)) throw new GoogleSignInCancelled('Cancelled');
    const token = response.data.idToken;
    if (!token) throw new Error('Google did not return an ID token. Check the Web client ID.');
    return token;
  } catch (e) {
    if (e instanceof GoogleSignInCancelled) throw e;
    if (g.isErrorWithCode(e)) {
      if (e.code === g.statusCodes.IN_PROGRESS) throw new GoogleSignInCancelled('Already in progress');
      if (e.code === g.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services is not available on this device.');
    }
    throw e;
  }
}

export async function googleSignOut(): Promise<void> {
  const g = load();
  if (!g) return;
  try {
    await g.GoogleSignin.signOut();
  } catch {
    // not signed in with Google — fine
  }
}
