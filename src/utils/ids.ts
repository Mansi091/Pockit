import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

/** 32+ hex chars → a UUID-shaped string (version 5 bits set) accepted by Postgres `uuid`. */
export function hexToUuid(hex: string): string {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32).padEnd(32, '0');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The same seed always gives the same id. Used where two offline devices may
 * create "the same" row (category links, event links, migrated addresses), so
 * they converge on one row in the cloud instead of duplicates.
 */
export async function deterministicId(seed: string): Promise<string> {
  return hexToUuid(await digestStringAsync(CryptoDigestAlgorithm.SHA256, seed));
}
