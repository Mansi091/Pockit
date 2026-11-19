import { isAlreadyCurrent, localWins, pullTable, pushTable, syncAll } from '@/sync/engine';
import { SYNC_TABLES } from '@/sync/tables';
import type { FileAccess, LocalStore, RemoteStore, Row, TableSpec } from '@/sync/types';

const CONTACTS = SYNC_TABLES.find((t) => t.name === 'contacts')!;
const PHONES = SYNC_TABLES.find((t) => t.name === 'contact_phones')!;
const USER = 'user-1';

// ── In-memory fakes that mirror the SQLite / Supabase semantics ──────────

function fakeLocal(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Map<string, Row>>();
  const cursors = new Map<string, string>();
  const purged: string[] = [];
  const t = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  for (const [name, rows] of Object.entries(seed)) rows.forEach((r) => t(name).set(r.id, { ...r }));
  const flagsOf = (spec: TableSpec) => ['needs_push', ...(spec.images ?? []).map((i) => i.flag)];

  const store: LocalStore = {
    getCursor: async (table) => cursors.get(table) ?? null,
    setCursor: async (table, v) => void cursors.set(table, v),
    findRow: async (table, id) => (t(table).get(id) ? { ...t(table).get(id)! } : null),
    pendingRows: async (spec) => [...t(spec.name).values()].filter((r) => flagsOf(spec).some((f) => r[f] === 1)).map((r) => ({ ...r })),
    applyRemote: async (spec, row) => {
      const prev = t(spec.name).get(row.id) ?? {};
      const next: Row = { ...prev, ...row };
      flagsOf(spec).forEach((f) => (next[f] = 0));
      t(spec.name).set(row.id, next);
    },
    markPushed: async (spec, id, updatedAt, patch, cleared) => {
      const r = t(spec.name).get(id)!;
      Object.assign(r, patch);
      if (r.updated_at === updatedAt) {
        r.needs_push = 0;
        cleared.forEach((f) => (r[f] = 0));
      }
    },
    purgeTombstones: async (table) => {
      purged.push(table);
      for (const [id, r] of t(table)) if (r.deleted_at && r.needs_push === 0) t(table).delete(id);
    },
  };
  return { store, tables, cursors, purged, get: (table: string, id: string) => t(table).get(id) };
}

function fakeRemote(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Map<string, Row>>();
  const upsertOrder: string[] = [];
  const uploaded: string[] = [];
  const removed: string[] = [];
  const downloaded: string[] = [];
  let clock = 1000;
  const t = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const stamp = () => new Date(Date.UTC(2026, 10, 19, 0, 0, clock++)).toISOString().replace('Z', '+00:00');
  for (const [name, rows] of Object.entries(seed)) rows.forEach((r) => t(name).set(r.id, { ...r, server_updated_at: r.server_updated_at ?? stamp() }));

  const store: RemoteStore = {
    pull: async (table, cursor, limit) =>
      [...t(table).values()]
        .filter((r) => Date.parse(r.server_updated_at as string) > Date.parse(cursor))
        .sort((a, b) => Date.parse(a.server_updated_at as string) - Date.parse(b.server_updated_at as string))
        .slice(0, limit) as (Row & { server_updated_at: string })[],
    upsert: async (table, rows) => {
      upsertOrder.push(table);
      rows.forEach((r) => t(table).set(r.id, { ...r, server_updated_at: stamp() }));
    },
    uploadImage: async (path) => (uploaded.push(path), true),
    removeImage: async (path) => (removed.push(path), true),
    downloadImage: async (path, id, suffix) => (downloaded.push(path), `file:///local/${id}${suffix}.jpg`),
  };
  return { store, tables, upsertOrder, uploaded, removed, downloaded, get: (table: string, id: string) => t(table).get(id) };
}

function fakeFiles(existing: string[] = []): FileAccess & { removed: string[] } {
  const set = new Set(existing);
  const removed: string[] = [];
  return {
    removed,
    exists: (uri) => !!uri && set.has(uri),
    remove: (uri) => {
      if (uri) {
        removed.push(uri);
        set.delete(uri);
      }
    },
  };
}

const contact = (over: Partial<Row> = {}): Row => ({
  id: 'c1',
  person_name: 'Priya Sharma',
  company_name: 'Nimbus',
  designation: null,
  phone: '+91 98765 43210',
  email: null,
  website: null,
  address: null,
  raw_ocr_text: null,
  is_favourite: 0,
  card_image_path: null,
  remote_image_path: null,
  card_back_image_path: null,
  remote_back_image_path: null,
  created_at: '2026-11-19T10:00:00.000Z',
  updated_at: '2026-11-19T10:00:00.000Z',
  deleted_at: null,
  needs_push: 0,
  image_needs_push: 0,
  back_image_needs_push: 0,
  ...over,
});

// ── Conflict rules (unchanged from P6) ────────────────────────────────

describe('conflict rules', () => {
  it('keeps unpushed local edits that are at least as new (last-write-wins)', () => {
    const local = contact({ needs_push: 1, updated_at: '2026-11-19T12:00:00.000Z' });
    expect(localWins(local, contact({ updated_at: '2026-11-19T11:00:00+00:00' }))).toBe(true);
    expect(localWins(local, contact({ updated_at: '2026-11-19T13:00:00+00:00' }))).toBe(false);
    expect(localWins({ ...local, needs_push: 0 }, contact({ updated_at: '2026-11-19T11:00:00+00:00' }))).toBe(false);
  });

  it('treats "…Z" and "…+00:00" as the same instant (fixes P6 re-apply churn)', () => {
    const local = contact({ updated_at: '2026-11-19T10:00:00.000Z' });
    const remote = contact({ updated_at: '2026-11-19T10:00:00+00:00' });
    expect(isAlreadyCurrent(CONTACTS, local, remote, fakeFiles())).toBe(true);
  });
});

// ── Push ──────────────────────────────────────────────────────────────

describe('push', () => {
  it('uploads the card image before the row, converts booleans, and clears flags', async () => {
    const local = fakeLocal({
      contacts: [contact({ needs_push: 1, image_needs_push: 1, is_favourite: 1, card_image_path: 'file:///a.jpg' })],
    });
    const remote = fakeRemote();
    const deps = { local: local.store, remote: remote.store, files: fakeFiles(['file:///a.jpg']), userId: USER };

    expect(await pushTable(CONTACTS, deps)).toBe(1);
    expect(remote.uploaded).toEqual(['user-1/c1.jpg']);
    const cloud = remote.get('contacts', 'c1')!;
    expect(cloud.user_id).toBe(USER);
    expect(cloud.is_favourite).toBe(true);
    expect(cloud.card_image_path).toBe('user-1/c1.jpg');
    expect('needs_push' in cloud).toBe(false); // local-only columns never leave the device
    const after = local.get('contacts', 'c1')!;
    expect([after.needs_push, after.image_needs_push, after.remote_image_path]).toEqual([0, 0, 'user-1/c1.jpg']);
  });

  it('keeps the row dirty if it was edited while the upload was in flight', async () => {
    const local = fakeLocal({ contacts: [contact({ needs_push: 1 })] });
    const remote = fakeRemote();
    const origUpsert = remote.store.upsert;
    remote.store.upsert = async (table, rows) => {
      await origUpsert(table, rows);
      local.get('contacts', 'c1')!.updated_at = '2026-11-19T10:05:00.000Z'; // concurrent edit
    };
    await pushTable(CONTACTS, { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER });
    expect(local.get('contacts', 'c1')!.needs_push).toBe(1);
  });

  it('removes the cloud image when a contact is deleted (tombstone)', async () => {
    const local = fakeLocal({
      contacts: [contact({ needs_push: 1, deleted_at: '2026-11-19T11:00:00.000Z', remote_image_path: 'user-1/c1.jpg' })],
    });
    const remote = fakeRemote();
    await pushTable(CONTACTS, { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER });
    expect(remote.removed).toEqual(['user-1/c1.jpg']);
    expect(remote.get('contacts', 'c1')!.deleted_at).toBe('2026-11-19T11:00:00.000Z');
  });

  it('pushes tables parent-first so cloud foreign keys never fail', async () => {
    const now = '2026-11-19T10:00:00.000Z';
    const local = fakeLocal({
      contacts: [contact({ needs_push: 1 })],
      contact_phones: [{ id: 'p1', contact_id: 'c1', label: 'mobile', national_number: '9876543210', needs_review: 0, position: 0, created_at: now, updated_at: now, deleted_at: null, needs_push: 1 }],
      reminders: [{ id: 'r1', contact_id: 'c1', title: 'Call', due_at: now, completed_at: null, created_at: now, updated_at: now, deleted_at: null, needs_push: 1 }],
    });
    const remote = fakeRemote();
    await syncAll(SYNC_TABLES, { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER });
    expect(remote.upsertOrder).toEqual(['contacts', 'contact_phones', 'reminders']);
    expect(remote.get('contact_phones', 'p1')!.needs_review).toBe(false);
  });
});

// ── Pull ──────────────────────────────────────────────────────────────

describe('pull', () => {
  it('applies newer cloud rows, normalises timestamps and booleans, downloads images, advances the cursor', async () => {
    const local = fakeLocal();
    const remote = fakeRemote({
      contacts: [{ ...contact(), user_id: USER, is_favourite: true, card_image_path: 'user-1/c1.jpg', updated_at: '2026-11-19T10:00:00+00:00' }],
    });
    const deps = { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER };
    expect(await pullTable(CONTACTS, deps)).toBe(1);

    const row = local.get('contacts', 'c1')!;
    expect(row.updated_at).toBe('2026-11-19T10:00:00.000Z');
    expect(row.is_favourite).toBe(1);
    expect(row.card_image_path).toBe('file:///local/c1.jpg');
    expect(row.remote_image_path).toBe('user-1/c1.jpg');
    expect(row.needs_push).toBe(0);
    expect(local.cursors.get('contacts')).toBeTruthy();

    // A second pull finds nothing new.
    expect(await pullTable(CONTACTS, deps)).toBe(0);
  });

  it('does not overwrite newer unpushed local edits', async () => {
    const local = fakeLocal({ contacts: [contact({ person_name: 'Local Edit', needs_push: 1, updated_at: '2026-11-19T12:00:00.000Z' })] });
    const remote = fakeRemote({ contacts: [{ ...contact({ person_name: 'Old Cloud' }), user_id: USER }] });
    await pullTable(CONTACTS, { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER });
    expect(local.get('contacts', 'c1')!.person_name).toBe('Local Edit');
  });

  it('deletes the local image file when a tombstone arrives', async () => {
    const local = fakeLocal({ contacts: [contact({ card_image_path: 'file:///c1.jpg', remote_image_path: 'user-1/c1.jpg' })] });
    const remote = fakeRemote({
      contacts: [{ ...contact({ deleted_at: '2026-11-19T11:00:00+00:00', updated_at: '2026-11-19T11:00:00+00:00' }), user_id: USER }],
    });
    const files = fakeFiles(['file:///c1.jpg']);
    await pullTable(CONTACTS, { local: local.store, remote: remote.store, files, userId: USER });
    expect(files.removed).toEqual(['file:///c1.jpg']);
    expect(local.get('contacts', 'c1')!.deleted_at).toBe('2026-11-19T11:00:00.000Z');
  });

  it('purges acknowledged tombstones child → parent', async () => {
    const local = fakeLocal();
    await syncAll(SYNC_TABLES, { local: local.store, remote: fakeRemote().store, files: fakeFiles(), userId: USER });
    expect(local.purged[0]).toBe('reminders');
    expect(local.purged[local.purged.length - 1]).toBe('contacts');
  });

  it('treats a phone row the same way as a contact (generic engine)', async () => {
    const now = '2026-11-19T10:00:00+00:00';
    const local = fakeLocal();
    const remote = fakeRemote({
      contact_phones: [{ id: 'p1', user_id: USER, contact_id: 'c1', label: 'work', country_iso: null, calling_code: null, national_number: '4155550142', e164: null, raw_input: '(415) 555-0142', needs_review: true, position: 0, created_at: now, updated_at: now, deleted_at: null }],
    });
    await pullTable(PHONES, { local: local.store, remote: remote.store, files: fakeFiles(), userId: USER });
    expect(local.get('contact_phones', 'p1')).toMatchObject({ needs_review: 1, national_number: '4155550142', needs_push: 0 });
  });
});
