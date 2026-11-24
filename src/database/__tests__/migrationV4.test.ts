jest.mock('expo-crypto', () => ({
  randomUUID: () => 'uuid',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // Stable fake hash: same seed → same id (that's the property under test).
  digestStringAsync: async (_alg: string, seed: string) => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h.toString(16).padStart(8, '0').repeat(8);
  },
}));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@/database/db', () => ({ getDb: jest.fn() }));

import { migrateLegacyAddresses, SCHEMA_VERSION } from '@/database/migrations';
import { addressRowValues, planById } from '@/database/structuredRepository';
import { CONTACT_CHILD_TABLES, SYNC_TABLES } from '@/sync/tables';

function fakeDb(contacts: { id: string; address: string | null }[], opts: { dropInserts?: boolean } = {}) {
  const rows = new Map<string, unknown[]>();
  return {
    rows,
    getAllAsync: async () => contacts.filter((c) => c.address && c.address.trim()),
    getFirstAsync: async () => ({ n: rows.size }),
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT OR IGNORE INTO contact_addresses') && !opts.dropInserts && !rows.has(params[0] as string)) {
        rows.set(params[0] as string, params);
      }
      return { changes: 1, lastInsertRowId: 0 };
    },
  };
}

describe('v4 migration: existing single addresses → contact_addresses', () => {
  it('schema is at v4', () => {
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('copies every existing address, reading PIN/city/state, and changes nothing else', async () => {
    const db = fakeDb([
      { id: 'c1', address: '4th Floor, Tech Park, Baner, Pune 411045' },
      { id: 'c2', address: null },
      { id: 'c3', address: 'Opp. Railway Station, Dewas - 455 001, Madhya Pradesh' },
    ]);
    const report = await migrateLegacyAddresses(db as never);
    expect(report).toEqual({ contacts: 2, created: 2 });
    const [first, second] = [...db.rows.values()];
    // params: id, contact_id, full_address, city, state, country, postal_code, position, …
    expect(first!.slice(1, 8)).toEqual(['c1', '4th Floor, Tech Park, Baner, Pune 411045', 'Pune', null, null, '411045', 0]);
    expect(second!.slice(1, 8)).toEqual(['c3', 'Opp. Railway Station, Dewas - 455 001, Madhya Pradesh', 'Dewas', 'Madhya Pradesh', 'India', '455001', 0]);
  });

  it('gives the same id on every device (no duplicates after sync)', async () => {
    const a = fakeDb([{ id: 'c1', address: '12 MG Road, Pune 411001' }]);
    const b = fakeDb([{ id: 'c1', address: '12 MG Road, Pune 411001' }]);
    await migrateLegacyAddresses(a as never);
    await migrateLegacyAddresses(b as never);
    expect([...a.rows.keys()]).toEqual([...b.rows.keys()]);
    // running twice on one device creates nothing new
    await migrateLegacyAddresses(a as never);
    expect(a.rows.size).toBe(1);
  });

  it('rolls back (throws) if any address was not copied', async () => {
    const db = fakeDb([{ id: 'c1', address: '12 MG Road, Pune 411001' }], { dropInserts: true });
    await expect(migrateLegacyAddresses(db as never)).rejects.toThrow(/incomplete/);
  });
});

describe('8. editing and deleting addresses', () => {
  const stored = [
    { id: 'a1', label: 'registered', full_address: '5 Park Street, Kolkata 700016', city: 'Kolkata', state: null, country: null, postal_code: '700016', position: 0 },
    { id: 'a2', label: 'factory', full_address: 'Plot 4, Hosur 635109', city: 'Hosur', state: null, country: null, postal_code: '635109', position: 1 },
  ];
  const same = (r: (typeof stored)[number], d: Parameters<typeof addressRowValues>[0], position: number) => {
    const v = addressRowValues(d);
    return r.full_address === v.fullAddress && r.label === v.label && r.city === v.city && r.postal_code === v.postalCode && r.position === position;
  };

  it('edit one, delete one, add one → update / remove / insert (ids kept)', () => {
    const plan = planById(stored, [
      { id: 'a1', label: 'registered', fullAddress: '5 Park Street, Kolkata 700017', city: 'Kolkata', state: '', country: '', postalCode: '700017' },
      { label: 'branch', fullAddress: '3 Anna Salai, Chennai 600002', city: 'Chennai', state: '', country: '', postalCode: '600002' },
    ], same);
    expect(plan.update.map((u) => u.id)).toEqual(['a1']);
    expect(plan.remove).toEqual(['a2']);
    expect(plan.insert).toHaveLength(1);
  });

  it('stores empty parts as null and caps lengths', () => {
    expect(addressRowValues({ label: 'other', fullAddress: '  12  MG Road ', city: ' ', state: '', country: 'India', postalCode: '' })).toEqual({
      label: 'other',
      fullAddress: '12 MG Road',
      city: null,
      state: null,
      country: 'India',
      postalCode: null,
    });
  });
});

describe('10. sync: addresses and extensions go to the cloud', () => {
  it('contact_addresses is synced and soft-deleted with its contact', () => {
    const t = SYNC_TABLES.find((s) => s.name === 'contact_addresses');
    expect(t?.columns).toEqual(expect.arrayContaining(['contact_id', 'label', 'full_address', 'city', 'state', 'country', 'postal_code']));
    expect(CONTACT_CHILD_TABLES).toContain('contact_addresses');
  });
  it('phone extension is synced', () => {
    expect(SYNC_TABLES.find((s) => s.name === 'contact_phones')?.columns).toContain('extension');
  });
  it('children are pushed after their parent contact', () => {
    const names = SYNC_TABLES.map((s) => s.name);
    expect(names.indexOf('contact_addresses')).toBeGreaterThan(names.indexOf('contacts'));
  });
});
