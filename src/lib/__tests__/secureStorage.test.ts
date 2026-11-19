const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import { secureSessionStorage } from '@/lib/secureStorage';

describe('secureSessionStorage (chunked)', () => {
  beforeEach(() => mockStore.clear());

  it('round-trips values larger than one SecureStore chunk', async () => {
    const big = 'x'.repeat(5000) + '{"token":"abc"}';
    await secureSessionStorage.setItem('sb-proj-auth-token', big);
    expect([...mockStore.keys()].filter((k) => k.endsWith('.n'))).toHaveLength(1);
    expect(await secureSessionStorage.getItem('sb-proj-auth-token')).toBe(big);
  });

  it('removes old chunks when overwritten with a shorter value', async () => {
    await secureSessionStorage.setItem('k', 'y'.repeat(4000));
    await secureSessionStorage.setItem('k', 'short');
    expect(await secureSessionStorage.getItem('k')).toBe('short');
    expect(mockStore.size).toBe(2); // k.0 + k.n
  });

  it('returns null when missing and after removal', async () => {
    expect(await secureSessionStorage.getItem('nope')).toBeNull();
    await secureSessionStorage.setItem('k', 'v');
    await secureSessionStorage.removeItem('k');
    expect(await secureSessionStorage.getItem('k')).toBeNull();
    expect(mockStore.size).toBe(0);
  });
});
