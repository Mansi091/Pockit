/**
 * Public runtime configuration. Expo inlines EXPO_PUBLIC_* variables from `.env`
 * (or the hosting provider's environment variables, e.g. Vercel) at bundle time.
 * Restart `npx expo start` after editing `.env`; redeploy after changing Vercel's.
 */

/** Values pasted into dashboards often carry spaces or quotes: "https://…" → https://… */
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();

const placeholder = (v: string) => !v || v.includes('YOUR-');

// A regex, not `new URL()`: React Native's built-in URL is incomplete on phones.
const isHttpUrl = (v: string) => /^https?:\/\/[^\s/?#]+(?::\d+)?(?:\/[^\s]*)?$/i.test(v);

export const env = {
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/+$/, ''),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
};

/** True only when both values are present AND the URL is a real http(s) address. */
export const isSupabaseConfigured =
  !placeholder(env.supabaseUrl) && !placeholder(env.supabaseAnonKey) && isHttpUrl(env.supabaseUrl);

export const isGoogleConfigured = !!env.googleWebClientId;
