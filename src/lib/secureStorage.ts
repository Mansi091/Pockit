import * as SecureStore from 'expo-secure-store';

/**
 * Storage adapter for the Supabase auth session.
 *
 * SecureStore encrypts values with the Android Keystore / iOS Keychain, but
 * values above ~2 KB are not reliably supported, and a Supabase session
 * (JWT + refresh token + user JSON) is often larger. So the value is split
 * into chunks stored under `<key>.0`, `<key>.1`, … plus a `<key>.n` count.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function removeChunks(base: string) {
  const n = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0');
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${base}.${i}`);
  await SecureStore.deleteItemAsync(`${base}.n`);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const n = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0');
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`);
      if (part === null) return null; // corrupted / partially written — treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    await removeChunks(base);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${base}.n`, String(count));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(safeKey(key));
  },
};
