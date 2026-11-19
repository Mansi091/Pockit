import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '@/config/env';
import { secureSessionStorage } from '@/lib/secureStorage';

/**
 * Single Supabase client for the whole app.
 * - Session tokens are persisted in encrypted SecureStore.
 * - detectSessionInUrl is off: auth emails use 6-digit codes typed into the app,
 *   which works in Expo Go and dev builds without deep-link configuration.
 * - Token auto-refresh only runs while the app is in the foreground.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Use inside code paths that only run once configuration has been verified. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. Fill in .env and restart the app.');
  return supabase;
}
