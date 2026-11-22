# Pockit — Project Handoff

> **Read this first** if you are an agent or developer picking up this project.
> It covers what has been built, what is verified, the rules to follow, the known pitfalls, and where to start.
> Last updated: **2026-11-22**.

---

## 1. Where to start (TL;DR)

1. **Nothing below the "verified" line in §4 has been tested on a real phone yet.** The first job is device testing of P8–P12 using the checklist in §9, then fixing what breaks.
2. After testing passes, start **launch preparation** (§10).
3. **Do NOT build** these without the owner's go-ahead (parked by the owner):
   - the UI refresh / new font;
   - the digital business card with QR;
   - the 3D calendar.
4. Before writing code, read §6 (rules) and §7 (pitfalls). Several of them were learned the hard way.

---

## 2. What Pockit is

An **Android-first** (iOS later) **Expo React Native + TypeScript** app:

1. Scan a business card.
2. Auto-crop it.
3. Read the text **on-device** with Google ML Kit OCR.
4. Extract structured contact fields.
5. The user reviews and saves the contact.
6. Store it **offline-first in SQLite** (the source of truth).
7. Optionally back it up to **Supabase** (Postgres + Storage, Row Level Security).

On top of that, the app does:
- Notes ("where we met")
- Follow-up reminders with local notifications
- A calendar
- Events with "Event mode"
- Batch scanning
- Categories and favourites
- Search across everything

The app was originally called "SmartCard Manager"; it was renamed **Pockit**. The local folder is still `D:\CARD-PROJECT\SmartCardManager`.

| Item | Value |
|---|---|
| Repo | https://github.com/Mansi091/Pockit (branch `main`) |
| Android package | `com.supremefacility.pockit` · scheme `pockit` |
| Expo / EAS project | `@pockitsupremefacility/pockit` (id `347ef816-c735-430e-ab4c-7bd6ec1ef70c`) |
| Supabase project | "pockit", region Sydney `ap-southeast-2` (moving to Mumbai is under consideration) |
| Owner profile | First-time mobile developer who wants a production-quality app ("like Instagram"), built with system-design thinking. Explain plainly, give a recommendation instead of open questions, and give exact commands to run. |

---

## 3. Tech stack (exact versions matter)

| Part | Choice |
|---|---|
| Framework | Expo **SDK 58**, React Native **0.88.1**, React **19.3.0**, TypeScript **6** |
| Routing | Expo Router (`src/app`), `Stack.Protected` guards, typed routes |
| Scanner | `react-native-document-scanner-plugin` (ML Kit Document Scanner; TurboModule `DocumentScanner`) |
| OCR | `@infinitered/react-native-mlkit-text-recognition` (core pinned **3.1.0**; module `RNMLKitTextRecognition`) |
| Local DB | `expo-sqlite`, **one file per user**: `smartcard_<userId>.db` |
| Backend | Supabase (Auth with 6-digit email OTP codes, Postgres, private Storage bucket `cards`) |
| Phones | `libphonenumber-js/max` |
| Notifications | `expo-notifications` (local only), `@react-native-community/datetimepicker` |
| Phone contacts | `expo-contacts` (new `Contact` class API) |
| Other | `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `react-native-view-shot`, `d3-hierarchy`, `expo-secure-store` |
| Builds | EAS Build, profile `development` (APK, dev client). `eas.json` pins `"node": "24.16.0"` |
| Local tooling | Node 24.16, npm 11.13. Jest via `jest-expo` |

---

## 4. Phase history and status

### Verified on the owner's phone ✅
| Phase | What |
|---|---|
| P1–P6 | Supabase email auth (sign-up, sign-in, OTP codes, reset), protected routes, per-user SQLite, camera/gallery, ML Kit OCR, rule-based extraction, offline-first sync, save to phone contacts |
| P7 | Auto-crop via the ML Kit Document Scanner, plus a manual-crop fallback. OCR read the "Amol Chitnis" card perfectly |
| Build 2 | App icon and splash, direct `Contact.create` save (fixes the missing name on MIUI), full-card photo for the phone contact via `react-native-view-shot` |

### Built and unit-tested, NOT yet verified on a device 🧪
| Phase | What | Key files |
|---|---|---|
| P7.0 | SQLite schema v2 + `supabase/migrations/0002–0004`, generic sync engine | `src/database/migrations.ts`, `src/sync/*` |
| P8 | Several labelled phones and emails per contact, country picker, WhatsApp action | `PhoneListEditor`, `EmailListEditor`, `src/utils/phone.ts` |
| P10 | Categories (colour/icon, many-to-many), ⭐ favourites, Categories tab (Bubbles / Connections / List), contact filters | `categoryRepository.ts`, `categoryService.ts`, `(tabs)/categories.tsx` |
| P11 | Back-side scanning; merge where the **front wins** (the back only fills blanks and adds new phones/emails); "Add back side" on existing contacts | `services/cardMerge.ts`, `cardCapture.ts`, `scan.tsx`, `processing.tsx` |
| OCR fix | `@` misread as letters (e.g. `Khuranaldeverestind.com`) and `+91` misread as `491` | `extractionService.ts` (`repairMisreadEmails`), `utils/phone.ts` (`fixMisreadPlus`) |
| P9 | Meeting notes, follow-up reminders + local notifications, calendar | `activityRepository.ts`, `activityService.ts`, `notificationService.ts`, `components/planner/*` |
| P12 | Events, Event mode, batch scan (up to 20 cards), enhanced search | `event/[id].tsx`, `EventModeBanner`, `scanSession.ts`, `contactRepository.search` |

**Automated checks (last run, 2026-11-22):**
- `npx tsc --noEmit` is clean.
- **104 Jest tests** pass (14 suites).
- `expo export --platform android` bundles successfully.

**Git:** the last commit is `9b29c2f "ocr implementation"` (it includes the OCR fix). **P9/P12, the README and this file are NOT committed yet.** Ask the owner to run `git add -A && git commit && git push`.

**Builds:** build 2 (`e232e959`) is installed on the owner's phone. Everything after build 2 is **JS-only**, and build 2 already contains the notifications and datetimepicker native modules, so **no new build is needed** to test P8–P12.

---

## 5. Architecture in one page

```
Screens (src/app)  →  Services (src/services)  →  Repositories (src/database, raw SQL)  →  SQLite
                                     └→ Sync engine (src/sync) ⇄ Supabase (when backup is ON)
```

### Navigation
- **Bottom bar:** Home · Contacts · (Scan action) · **Planner** · Categories.
- **Settings** is a stack screen (`src/app/settings.tsx`), opened from the ⚙️ on Home.
- **Separate tabs rule.** The owner explicitly wants features on separate tabs, not crammed onto one page:
  - Planner has top tabs **Follow-ups / Calendar / Events** (`SegmentedTabs`).
  - The contact page has **Details / Notes / Follow-ups**.
  - `?tab=` route params open a specific tab.

### Scan flow
`scan.tsx` (front / back / batch) → `processing.tsx` (OCR + extract + merge) → `review-contact.tsx` (user confirms; for new contacts it also has "Where you met" and "Follow-up" sections) → `createContact` + `recordFirstMeeting`. Shared state lives in `services/scanSession.ts`:
- `image`, `back` — front and back of the current card
- `targetContactId` — set when adding a back side to an existing contact
- `queue` / `batch` — the remaining cards in a batch scan

### Data
- SQLite holds:
  - `contacts`, with the legacy `phone`/`email` summary columns still present;
  - the child tables `contact_phones`, `contact_emails`, `contact_categories`, `event_contacts`, `interactions`, `reminders`;
  - `categories`, `events`;
  - `meta` (sync cursors, `backup_enabled`, `active_event_id`).
- Every synced table has `created_at`/`updated_at`/`deleted_at` (soft delete) and `needs_push`.
- Local child tables have **no FKs**, because sync can deliver a child before its parent. Postgres enforces integrity with composite FKs `(x_id, user_id)`.

### Sync
`src/sync/engine.ts` is table-driven (`sync/tables.ts`):
1. Pull by server cursor.
2. Push parent→child, uploading images before rows.
3. Purge tombstones child→parent.

Conflict rule: last-write-wins on `updated_at`. Card images go to `cards/<uid>/<id>.jpg` and `<id>_back.jpg`.

### Migrations
- `PRAGMA user_version`; each step runs in a transaction.
- `VACUUM INTO` backup before risky steps.
- Strategy is **expand → validate → contract**: the legacy columns are kept until the new structure is validated.

### Deterministic link IDs
`contact_categories` and `event_contacts` IDs are a SHA-256 of both IDs, shaped as a UUID v5. Two offline phones therefore create the *same* row instead of clashing on the cloud's unique constraint.

### Notifications
- Local only.
- `refreshNotifications()` cancels everything Pockit scheduled, then reschedules the nearest 60 open future follow-ups. It runs after **any** data change, via `useContactsVersion` in `(tabs)/_layout.tsx`.
- Permission is requested on the first follow-up only.
- Sign-out cancels all scheduled notifications.

### Event mode
`meta.active_event_id`, local to the device. New scans are linked to the event and the place is prefilled.

### Data refresh
`services/dataEvents.ts` is a tiny pub/sub (`emitContactsChanged`, `useContactsVersion`). Screens reload when it fires.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for detail.

---

## 6. Rules from the owner (must follow)

1. **Never invent APIs.** Verify against the installed `.d.ts` files or versioned Expo docs (see `AGENTS.md`). Expo changes every SDK.
2. **Never claim a feature works until it has been tested on a device.** Say "built, untested" when that's the truth.
3. **OCR and processing stay on-device.** SQLite is the source of truth; the app is offline-first.
4. **Loading, empty and error states on every screen.**
5. **Security:**
   - RLS on every table.
   - Never put the `service_role` key in the app.
   - `.env` stays git-ignored.
   - Never disable security policies to make something work.
   - Don't ask for or handle the owner's SMTP or app passwords.
6. **Phones:** assign +91 **only** for confirmed Indian numbers. That means an explicit +91/0091, a valid 10-digit mobile starting with 6–9, or a 0-prefixed STD landline. Otherwise flag the number for review.
7. **Work one phase at a time.** After each phase:
   - run `tsc`, tests and `expo-doctor`;
   - update the docs;
   - say clearly which features need a new native build.
8. **Parked; don't build without being asked:**
   - Digital business card / QR
   - UI refresh / new font (the owner asked about shadcn-style RN libraries; options discussed were React Native Reusables or HeroUI Native, with Geist / Plus Jakarta Sans / Manrope fonts)
   - 3D calendar
9. Don't drop the legacy `contacts.phone/email` columns until the new structure has been validated on a device.

---

## 7. Pitfalls already hit (don't repeat)

| Problem | Rule |
|---|---|
| Requiring a missing native module crashes in dev **even inside try/catch** | Guard first: `requireOptionalNativeModule('X')` (from `expo`) or `TurboModuleRegistry.get('X')`, *then* `require`. See `ocrService`, `notificationService`, `DateTimeField`, `documentScannerService`, `googleAuth` |
| PowerShell 5.1 `Set-Content`/`Out-File` adds a UTF-8 BOM, which broke the expo config | Write files with the Write/Edit tools or Node |
| Writing TS template literals via `bash node -e` mangled the backticks | Use the Edit tool |
| JS `String.replace(a, b)` treats `` $` `` / `$&` in `b` as special patterns and corrupted a file | Use `split(a).join(b)` or the Edit tool |
| Running `expo export` while the owner's Metro server was running corrupted the shared cache | Check that ports 8081–8083 are free first. If the server is up, verify bundles with curl instead |
| Typed routes (`.expo/types/router.d.ts`) are **not** regenerated by `expo export` | Start `npx expo start` briefly (CI=1, another port), then kill it |
| EAS's npm 10 resolved the mlkit-core 3.1.0 test deps differently from local npm 11, and `npm ci` failed | Keep `"node": "24.16.0"` in `eas.json`. Regenerate the lockfile with npm 11 if deps change |
| TS 6 with Jest | `tsconfig` needs `"types": ["jest"]` |
| RN 0.88 | `StyleSheet.absoluteFillObject` is gone; use `React.ComponentRef<typeof View>` for refs |
| `d3-hierarchy` is ESM and Jest choked on it | Jest `moduleNameMapper` points it at the dist UMD build |
| `expo-image-manipulator` `extent` is web-only | Square card photos use `react-native-view-shot` (`CardPhotoComposer`) |
| MIUI dropped the name passed via `presentCreateForm` | Save with `Contact.create` directly |
| The Supabase project has **no automatic table grants** | Every new table needs an explicit `grant … to authenticated` (see `0003_table_grants.sql`) |
| libphonenumber says "(415) 555-0142" is a valid *Indian* number | Hence the strict +91 rule in §6 |
| The owner's office Wi-Fi blocks phone↔laptop traffic | Use `--tunnel` with 4G. The tunnel needs `npx expo login` |

---

## 8. How to run

```bash
cd D:\CARD-PROJECT\SmartCardManager
npx expo start --dev-client --tunnel   # owner: open Pockit on the phone → "Scan QR Code"
npm test                               # 104 tests
npm run typecheck
npx expo-doctor
npx eas build --profile development --platform android   # only if native deps / app.json plugins change
```

**Cloud setup:**
- Supabase migrations `0001`–`0004` have been run by the owner, and anon access was verified as blocked.
- **Confirm email is OFF** for development.
- `.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

---

## 9. Next step: device testing checklist

Give this to the owner and collect ✅/❌ with screenshots:

| | Test | Expected |
|---|---|---|
| A | Bottom bar, ⚙️ on Home | Home · Contacts · Scan · Planner · Categories; the gear opens Settings |
| B1 | Rescan the **Everest** card | Email `hemant.khurana@everestind.com`, website `www.everestind.com`, phone `+91 98672 99476`. If wrong, get the "Show raw OCR text" screenshot |
| B2 | Add back side → Read both sides | Both images shown; back info merged without overwriting the front |
| B3 | Scan several cards (3) | "Card 1 of 3", Save & next / Skip card, "Batch finished" alert |
| C | New contact with Where you met + Follow-up "Tomorrow" | Shows in the contact's Notes and Follow-ups tabs |
| D | Follow-up 2–3 min ahead | Permission prompt, then a notification; tapping it opens the contact's Follow-ups tab |
| E | Planner: Follow-ups / Calendar | Buckets; tick to mark done; long-press to snooze; calendar dots and the day list |
| F | Event → Event mode → scan | Pink banner; contact linked to the event; "Scan next card" |
| G | Categories / ⭐ | Bubbles, Connections line, favourites on Home |
| H | Search for phone digits, a note word, an event name | Finds the person |

Fix the failures, then the owner commits and pushes.

---

## 10. After testing: launch preparation (recommended order)

1. **Email:** Gmail SMTP (or another provider) in Supabase, with `{{ .Token }}` 6-digit templates, then turn **Confirm email back ON**. The owner configures the SMTP password themselves.
2. **Crash reporting:** Sentry.
3. **Privacy policy:** required by Play because of the camera and contacts permissions.
4. **Production build** and Google Play **internal testing** track.
5. **Google sign-in** (optional; the code exists in `src/auth/googleAuth.ts` and is guarded).
6. **"Contract" migration:** drop the legacy `contacts.phone/email` columns, only after P8 is validated on a device.
7. Optionally move Supabase from Sydney to Mumbai for latency.
8. **Housekeeping:** the `LICENSE` file is the Expo template's (© 650 Industries). The owner should replace it.

**Later (owner's decision):** UI refresh, digital business card with QR, and iOS (needs an Apple Developer account, $99/yr).

---

## 11. Key files map

| Need to change… | Look in |
|---|---|
| Which line becomes name/phone/email | `src/services/extractionService.ts` (+ `__tests__/extractionService.test.ts`, `ocrMisreads.test.ts`) |
| Phone parsing / +91 rules | `src/utils/phone.ts` |
| Front/back merge | `src/services/cardMerge.ts` |
| Scan → OCR → review flow | `src/app/scan.tsx`, `processing.tsx`, `review-contact.tsx`, `services/scanSession.ts` |
| Contacts CRUD and search | `src/services/contactService.ts`, `src/database/contactRepository.ts` |
| Notes / follow-ups / events / calendar | `src/services/activityService.ts`, `src/database/activityRepository.ts`, `src/components/planner/*` |
| Notifications | `src/services/notificationService.ts`, `(tabs)/_layout.tsx` |
| Schema changes | `src/database/migrations.ts` **and** a new `supabase/migrations/000N_*.sql` (RLS + grants), then `src/sync/tables.ts` |
| Auth | `src/auth/AuthProvider.tsx`, `src/app/(auth)/*` |
| Theme | `src/constants/theme.ts` (indigo `#4F46E5`, "modern minimal") |
