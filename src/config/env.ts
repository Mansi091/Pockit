/**
 * Public runtime configuration. Expo inlines EXPO_PUBLIC_* variables from `.env`
 * at bundle time (restart `npx expo start` after editing `.env`).
 */
const placeholder = (v: string | undefined) => !v || v.includes('YOUR-');

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
};

export const isSupabaseConfigured =
  !placeholder(env.supabaseUrl) && !placeholder(env.supabaseAnonKey);

export const isGoogleConfigured = !!env.googleWebClientId;
