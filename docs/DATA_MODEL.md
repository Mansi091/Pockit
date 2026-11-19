# Pockit — Data Model & Migrations

## Schema (v2)

Same tables exist on the phone (SQLite, one file per user) and in Supabase (Postgres).
Cloud tables add `user_id` (RLS) and `server_updated_at` (sync cursor).
Local tables add sync flags (`needs_push`, image flags) that never leave the device.

| Table | Purpose | Key relationships |
|---|---|---|
| `contacts` | The person. `+ is_favourite`, `+ card_back_image_path` in v2 | — |
| `contact_phones` | Labelled numbers: `label`, `country_iso`, `calling_code`, `national_number`, `e164`, `raw_input`, `needs_review`, `position` | → contacts (many) |
| `contact_emails` | Labelled addresses | → contacts (many) |
| `categories` | User-defined groups: `name`, `color`, `icon` | — |
| `contact_categories` | Many-to-many contact ↔ category, unique pair. **Id = SHA-256 of the pair** (UUID-shaped), so two devices linking the same pair offline create the same row; unlinking tombstones it, re-linking revives it | → contacts, → categories |
| `events` | Wedding, expo, conference…: `name`, `location`, `starts_on`, `ends_on` | — |
| `event_contacts` | Many-to-many event ↔ contact, unique pair | → events, → contacts |
| `interactions` | Meeting details & notes history: `occurred_on`, `place`, `notes` | → contacts (many) |
| `reminders` | Follow-ups: `title`, `due_at`, `completed_at` (+ local-only `notification_id`) | → contacts (many) |

All synced rows have `id` (UUID made on the phone), `created_at`, `updated_at`, `deleted_at` (tombstone).

### Security (Supabase, `0002_structured_data.sql`)
- Every table: RLS enabled, four policies (`select/insert/update/delete`) restricted to `user_id = auth.uid()`.
- Child tables reference `(contact_id, user_id)` → `contacts (id, user_id)`: a row can never point at
  another user's contact, even by guessing an id.
- Check constraints on labels, phone formats, colours, lengths and event date order.
- Everything cascades from `auth.users`, so `delete_my_account()` (0001) still removes all data.

## Migration strategy — expand → validate → contract

1. **Backup.** Before v2 runs on a phone with data, SQLite writes `smartcard_<user>.db.v1.bak`
   (`VACUUM INTO`, consistent even in WAL mode).
2. **Expand.** v2 creates the new tables and copies every legacy `phone` / `email` value into
   `contact_phones` / `contact_emails`. Country rule for phones:
   - explicit `+91`/`0091`/`91…`, a valid Indian **mobile**, or a valid Indian landline written with
     its STD `0` → `+91`
   - explicit foreign code → kept, but `needs_review = 1`
   - anything else (e.g. `(415) 555-0142`, which would *wrongly* validate as Indian) → no country,
     `needs_review = 1`
3. **Verify.** Source parts are counted against rows created; any mismatch throws and the whole
   step rolls back (DB stays at v1). A report is saved in `meta.migration_v2_report`.
4. **P8 editor (done).** The Review screen edits phones/emails as structured lists (country picker,
   labels Mobile·Personal·Work·Office·WhatsApp·Other / Work·Personal·Other, first = main). Saving diffs
   by row id (`planById`), so unchanged rows are untouched and removals are tombstoned. The legacy
   `contacts.phone/email` columns are still written as a display summary until the contract step.
5. **Contract (later).** `contacts.phone` / `contacts.email` are dropped by a *future* migration,
   only after the structured data has been reviewed on real devices.

Cloud side: `0001` is never edited; `0002` is additive and idempotent.

## Sync engine (`src/sync/`)

- `tables.ts` — every synced table in parent → child order with its columns, booleans, timestamps, images.
- `engine.ts` — pure pull/push/purge logic (unit-tested with in-memory fakes).
- `sqliteLocalStore.ts` / `supabaseRemoteStore.ts` — the real implementations.

Rules are exactly P6's: last-write-wins on `updated_at` (compared as instants), local unpushed edits
win ties, images upload before rows, deletions travel as tombstones. The contacts pull cursor reuses
the P6 key, so upgrading does not re-download everything. If the cloud is missing a v2 table/column,
sync stops with "run 0002" instead of failing silently.
