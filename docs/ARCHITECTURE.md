# Pockit — Architecture

## Big picture

```
┌──────────────────────── PHONE (Expo / React Native) ────────────────────────┐
│ Screens  src/app/            (Expo Router, guarded by auth state)           │
│    │                                                                        │
│ Services src/services/       contact · image · camera · ocr · extraction    │
│    │                         sync · nativeContacts · scanSession            │
│    ├── SQLite  src/database/ one DB file per user — the source of truth     │
│    ├── Files   documents/cards/<userId>/<contactId>.jpg                     │
│    ├── ML Kit  Text Recognition v2, on-device (no image upload)             │
│    └── Phone Contacts app (expo-contacts, user-confirmed form)              │
└────────────┬────────────────────────────────────────────────────────────────┘
             │ HTTPS, only when signed in / backup enabled
┌────────────▼──────────── SUPABASE ──────────────────────────────────────────┐
│ Auth      email+password (6-digit codes), Google ID-token sign-in           │
│ Postgres  public.contacts (mirror of SQLite) — Row Level Security per user  │
│ Storage   private bucket "cards/<userId>/…"  — RLS per folder               │
│ SQL fn    delete_my_account() — Play-Store-required account deletion        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

| Decision | Why |
|---|---|
| **Offline-first**: UI reads/writes SQLite only; sync is a background job | Instant UI, works without signal |
| **One SQLite file per user** | Shared phones can't leak contacts between accounts |
| **UUID primary keys** generated on the phone | Offline creates on two devices never collide |
| **Soft deletes (tombstones)** | Deletions can sync to the cloud / other devices |
| **Server-stamped `server_updated_at` cursor** | Pulling changes doesn't depend on phone clocks |
| **Last-write-wins on `updated_at`** | Simple, predictable conflict rule for single-user data |
| **Backup off by default** | Cards contain other people's data; user opts in |
| **Session in SecureStore (chunked)** | Tokens encrypted by Android Keystore |
| **Auth codes instead of magic links** | Works in Expo Go, dev and prod builds with no deep-link setup |
| **Rule-based extraction, no LLM** | Free, offline, private, deterministic and unit-tested |
| **Native modules loaded lazily** | Same code runs in Expo Go (features degrade gracefully) |

## Flows

**Sign-in:** `AuthProvider` restores the session → opens `smartcard_<userId>.db`
→ runs migrations → `initSync()` → router guard shows the app.

**Scan (P7):**
- *Automatic* (dev/prod build): Google ML Kit Document Scanner (react-native-document-scanner-plugin)
  detects the card's corners, corrects perspective, offers corner adjustment, rotate, enhance filters
  and retake in Google's own screen. Limitation: only the final processed image is returned — the
  uncropped original never reaches Pockit (review/retake happen before confirmation).
- *Manual fallback* (Expo Go, no Google Play services, or user choice): system camera / gallery →
  Android crop screen (expo-image-picker allowsEditing).
- Either way → prepareImage (orientation baked in, ≤2000 px JPEG) → preview (Use / Rotate / Retake)
  → Processing: recognizeText (ML Kit OCR) → extractContact → Review → createContact copies the image
  into documents storage.

**Sync (`syncService.syncNow`):** pull (server cursor) → apply unless local copy is
newer and unpushed → push dirty rows (upload images first) → purge acknowledged
tombstones. Triggered after edits (debounced), at sign-in, and via *Sync now*.

**Save to phone contacts:** `Contact.presentCreateForm` opens Android's own
"Create contact" screen pre-filled; the user picks the account (e.g. Google, so it
syncs to all their devices) and confirms. The new contact's id is stored in
`native_contact_id` so the profile shows "Saved to Phone · Open".

## Schema v2 & generic sync (P7.0)

Structured phones/emails, categories, events, interactions and reminders — plus how the
expand → validate → contract migration and the table-driven sync engine work — are documented in
[DATA_MODEL.md](DATA_MODEL.md).

## Folder map

```
src/app/            screens (route = file)        (auth)/ sign-in, sign-up, verify, reset
src/auth/           AuthProvider, Google sign-in
src/components/     reusable UI
src/config/env.ts   public runtime config (.env)
src/database/       db lifecycle, migrations, repositories (SQL only)
src/lib/            supabase client, secure session storage, runtime detection
src/services/       business logic (no UI)
src/sync/           generic sync engine + table specs + SQLite/Supabase stores
src/types/          domain types
supabase/migrations cloud schema + RLS (run in Supabase SQL editor)
docs/               this file, SETUP.md
```

## Roadmap after this

- P7 hardening: Sentry crash reporting, ESLint in CI (GitHub Actions), privacy policy,
  Play Console *Data safety* form, account-deletion web page, internal testing track.
- Proposed next: Categories (many per contact) + ⭐ Favourites + Event mode
  (auto-tag cards scanned at a function); then notes / "where we met" + follow-up reminders;
  card back side + Hindi/Marathi (Devanagari) OCR; export/share (vCard, CSV, WhatsApp).
- **Later (parked by product owner): Digital business card** — the user creates their
  own card and shares it via a QR code (Blinq / HiHello style).
- Optional: biometric app lock, LLM fallback for hard cards, team address book, CRM export.

## Two-sided cards (P11, back side)

- Scan screen: front first, then an optional **Add back side** (auto scanner / camera / gallery via `services/cardCapture.ts`). Back can be rotated, replaced, swapped with the front or removed.
- Processing reads both sides with ML Kit. `services/cardMerge.ts` merges them: **the front always wins**; the back only fills empty fields and adds phone numbers (matched on last 10 digits) and emails (case-insensitive) that aren't already present. Raw OCR text is joined with a `--- Back side ---` separator. If only the back fails to read, the scan continues and the back image is still saved.
- Existing contacts: profile → **Add back side** → processing in back-only mode (`scanSession.targetContactId`) → review screen (`?id=…&addBack=1`) shows the merge for confirmation; nothing is saved until the user taps Save.
- Storage: `contacts.card_back_image_path` locally as `<id>_back.jpg`; synced to `cards/<uid>/<id>_back.jpg` by the existing image spec in `sync/tables.ts`. No schema change was needed (added in v2 / 0002).

## Navigation (P9/P12)

Bottom bar: **Home · Contacts · (Scan) · Planner · Categories**. Settings opens from the gear on Home (stack screen `src/app/settings.tsx`).
Each area has its own screen; nothing is stacked onto one long page:

- **Planner** (`(tabs)/planner.tsx`) has three top tabs (`SegmentedTabs`): **Follow-ups** (overdue / today / upcoming / done), **Calendar** (month grid with coloured dots: met, follow-up, card added, event; tap a day for its timeline), **Events**.
- **Contact page** has three top tabs: **Details** (info, card images, save to phone) · **Notes** (meeting history timeline) · **Follow-ups**. `?tab=notes|followups` opens a tab directly (used by notifications and the calendar).
- **Event page** (`event/[id].tsx`): Event mode on/off, "Scan cards for this event", add existing contacts, people met.

## Meeting notes, follow-ups, events (P9 + P12)

- Data: `interactions`, `reminders`, `events`, `event_contacts` (schema from v2 / 0002, already synced). Repository `database/activityRepository.ts`, rules in `services/activityService.ts` (limits mirror the Postgres CHECKs).
- New contacts: the review screen has optional **Where you met** (date, place, note) and **Follow-up reminder** sections, saved with `recordFirstMeeting` in one transaction right after the contact.
- Notifications (`services/notificationService.ts`, expo-notifications, guarded): local only. After any data change or sync, `refreshNotifications()` cancels Pockit's scheduled alerts and schedules the nearest 60 open future follow-ups. Permission is asked on the first follow-up, never at launch. Tapping an alert opens the contact's Follow-ups tab. Sign-out cancels everything.
- **Event mode** (`meta.active_event_id`, this device only): new scans are linked to the event and the meeting place is prefilled; after saving, "Scan next card" goes straight back to the camera.
- **Batch scan**: Google's scanner captures up to 20 cards in one session (`scanCardsAutomatically`). `scanSession` queues them; each card goes through OCR → review → **Save & next / Skip card**. Stop discards only the cards not yet reviewed.
- `event_contacts` ids are deterministic (SHA-256 of event+contact, like `contact_categories`) so two offline devices can't clash on the cloud's unique constraint.

## Search

Contacts search matches name, company, designation, website, address, every email, phone digits (spaces/dashes/+ ignored), category names, meeting notes/places and event names.
