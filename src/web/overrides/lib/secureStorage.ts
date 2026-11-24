/**
 * Web version of the Supabase session storage (secureStorage.ts is the phone one).
 * Browsers have no Keystore/Keychain; Supabase's standard for the web is
 * localStorage, scoped to this site's origin. Same interface as the phone adapter.
 */
function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // e.g. storage blocked by the browser
  }
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return store()?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store()?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store()?.removeItem(key);
  },
};
