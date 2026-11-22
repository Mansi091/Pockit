let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@/database/db', () => ({ getDb: jest.fn() }));

import { migrateLegacyPhonesAndEmails, verifyMigrationV2 } from '@/database/migrations';
import { planById } from '@/database/structuredRepository';

/** Minimal stand-in for expo-sqlite covering the statements the data migration issues. */
function fakeDb(contacts: { id: string; phone: string | null; email: string | null }[], opts: { dropPhoneInserts?: boolean } = {}) {
  const phones: unknown[][] = [];
  const emails: unknown[][] = [];
  const meta = new Map<string, string>();
  return {
    phones,
    emails,
    meta,
    getAllAsync: async () => contacts,
    getFirstAsync: async (sql: string) => ({ n: sql.includes('contact_phones') ? phones.length : emails.length }),
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO contact_phones')) {
        if (!opts.dropPhoneInserts) phones.push(params);
      } else if (sql.includes('INSERT INTO contact_emails')) emails.push(params);
      else if (sql.includes('INSERT INTO meta')) meta.set('migration_v2_report', params[0] as string);
      return { changes: 1, lastInsertRowId: 0 };
    },
  };
}

describe('v2 data migration', () => {
  it('copies every legacy phone/email, flags unconfirmed numbers and records a report', async () => {
    const db = fakeDb([
      { id: 'c1', phone: '+91 98765 43210, (415) 555-0142', email: 'Priya@Nimbus.in, info@nimbus.in' },
      { id: 'c2', phone: '020 2567 8900', email: null },
      { id: 'c3', phone: null, email: null },
    ]);
    const report = await migrateLegacyPhonesAndEmails(db as never);

    expect(report).toMatchObject({ contacts: 3, phonesSource: 3, phonesCreated: 3, phonesNeedingReview: 0, emailsSource: 2, emailsCreated: 2 });
    // columns: id, contact_id, label, country_iso, calling_code, national_number, e164, raw_input, needs_review, position, …
    const [indianMobile, usNumber, landline] = db.phones;
    expect(indianMobile!.slice(1, 9)).toEqual(['c1', 'mobile', 'IN', '91', '9876543210', '+919876543210', '+91 98765 43210', 0]);
    expect(usNumber!.slice(1, 10)).toEqual(['c1', 'other', 'US', '1', '4155550142', '+14155550142', '(415) 555-0142', 0, 1]);
    expect(landline!.slice(3, 5)).toEqual(['IN', '91']);
    expect(db.emails[0]![2]).toBe('priya@nimbus.in');
    expect(JSON.parse(db.meta.get('migration_v2_report')!).phonesNeedingReview).toBe(0);
  });

  it('fails (so the transaction rolls back) if any value was not carried over', async () => {
    const db = fakeDb([{ id: 'c1', phone: '98765 43210', email: null }], { dropPhoneInserts: true });
    await expect(migrateLegacyPhonesAndEmails(db as never)).rejects.toThrow(/Migration v2 check failed/);
  });

  it('verifyMigrationV2 accepts matching counts', () => {
    expect(() =>
      verifyMigrationV2({ contacts: 1, phonesSource: 2, phonesCreated: 2, phonesNeedingReview: 0, emailsSource: 0, emailsCreated: 0, at: '' }),
    ).not.toThrow();
  });
});

describe('planById (P8 list saving keeps row ids stable)', () => {
  const same = (r: { v: string }, d: { v: string }) => r.v === d.v;
  it('keeps unchanged rows, updates edited rows, inserts new drafts and removes deleted rows', () => {
    const existing = [{ id: 'a', v: '1' }, { id: 'b', v: '2' }, { id: 'c', v: '3' }];
    const plan = planById(existing, [{ id: 'b', v: '2' }, { id: 'a', v: 'changed' }, { v: 'new' }], same);
    expect(plan.update).toEqual([{ id: 'a', draft: { id: 'a', v: 'changed' }, position: 1 }]);
    expect(plan.insert).toEqual([{ draft: { v: 'new' }, position: 2 }]);
    expect(plan.remove).toEqual(['c']);
  });

  it('treats an unknown or duplicated id as a new row', () => {
    const plan = planById([{ id: 'a', v: '1' }], [{ id: 'a', v: '1' }, { id: 'a', v: '1' }, { id: 'zzz', v: '9' }], same);
    expect(plan.insert.map((i) => i.position)).toEqual([1, 2]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('flags a reordered row for update (position is part of "same")', () => {
    const rows = [{ id: 'a', v: '1', position: 0 }, { id: 'b', v: '2', position: 1 }];
    const plan = planById(rows, [{ id: 'b', v: '2' }, { id: 'a', v: '1' }], (r, d, pos) => r.v === d.v && r.position === pos);
    expect(plan.update.map((u) => u.id).sort()).toEqual(['a', 'b']);
  });
});
