# Pockit

**Scan a business card. Pockit reads it on your phone, saves the person, and reminds you to follow up.**

Pockit is an Android app (iOS later) for people who collect business cards at meetings, expos and conferences. Instead of a pile of paper cards, you get a searchable address book that remembers *where* you met each person, what you talked about, and *when* to get back to them.

---

## Contents

1. [What Pockit does](#what-pockit-does)
2. [How a scan works](#how-a-scan-works)
3. [Project status](#project-status)
4. [Tech stack](#tech-stack)
5. [How the app is built](#how-the-app-is-built)
6. [Folder structure](#folder-structure)
7. [Getting started](#getting-started)
8. [Everyday commands](#everyday-commands)
9. [Privacy and security](#privacy-and-security)
10. [Roadmap](#roadmap)
11. [More documentation](#more-documentation)

---

## What Pockit does

### Scanning
- **Auto-crop scanner:** point the camera at a card. Google's document scanner finds the edges, crops and straightens it.
- **Reads the text on the phone:** Google ML Kit OCR runs on the device. Card photos are never sent to an AI service.
- **Fills the form for you:** name, company, designation, phone numbers, emails, website and address. Anything uncertain is marked *"please check this"*.
- **Fixes common OCR mistakes,** such as an `@` read as letters or a `+91` read as `491`.
- **Both sides of a card:** add the back side and Pockit merges it. The front always wins; the back only fills gaps.
- **Batch scanning:** scan up to 20 cards in one go, then check each with **Save & next** or **Skip**.
- **Manual options:** crop a photo yourself, pick from the gallery, or type the details by hand.

### Contacts
- Several **phone numbers and emails** per person, each with a label (Mobile, Work, Office, WhatsApp…) and a country.
- **+91 is added only when the number is confirmed Indian.** Anything uncertain is flagged for you to check.
- **Duplicate warning** when a phone or email already exists.
- **Save to phone contacts** in one tap, with the card image as the contact photo.
- One-tap **Call, Email, WhatsApp and Website**.

### Organising
- **Categories** (Clients, Family, Vendors…) with colours and icons. A person can be in several.
- **⭐ Favourites,** shown on the Home screen.
- **Categories tab** with three views:
  - **Bubbles:** bubble size = number of people.
  - **Connections:** which categories share people.
  - **List**.
- **Search everything:** name, company, designation, phone digits, email, address, category, notes, meeting place and event name.

### Remembering and following up
- **Notes:** where and when you met, and what you talked about, kept as a timeline per person.
- **Follow-up reminders** with phone notifications: *Tomorrow*, *In 3 days*, *Next week*, or an exact date and time.
- **Planner tab:**
  - **Follow-ups:** overdue, today, upcoming and done.
  - **Calendar:** a month view of who you met and what's due.
  - **Events**.
- **Event mode:** at an expo, turn it on and every card you scan is added to that event automatically.

### Account and backup
- Sign up with email and a **6-digit code**; password reset also uses a code.
- **Works offline.** All data lives on the phone first.
- **Optional cloud backup** (off by default). When it's on, contacts, card images and everything else sync to the cloud, so a new phone gets them back.
- **Delete account** removes everything, from the phone and from the cloud.

---

## How a scan works

```
 ┌──────────┐   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │  Camera  │──▶│  Auto-crop    │──▶│  OCR (text)  │──▶│  Extraction  │──▶│ Review form  │
 │ / gallery│   │ (ML Kit Doc   │   │  ML Kit, on  │   │  rules: name,│   │ you check &  │
 │          │   │  Scanner)     │   │  the phone   │   │  phone, email│   │ save         │
 └──────────┘   └───────────────┘   └──────────────┘   └──────────────┘   └──────┬───────┘
                                                                                 │
                       ┌─────────────────────────────────────────────────────────┘
                       ▼
              ┌─────────────────┐   when backup   ┌──────────────────────────┐
              │ SQLite on phone │ ──── is on ───▶ │ Supabase (Postgres +     │
              │ (source of truth)│ ◀──────────────│ private image storage)   │
              └─────────────────┘                  └──────────────────────────┘
```

1. **Capture:** the scanner returns a cropped, straightened image of the card.
2. **OCR:** ML Kit turns the image into lines of text, on the device.
3. **Extraction** ([`src/services/extractionService.ts`](src/services/extractionService.ts)): rules decide which line is the name, the company, a phone number and so on. It never makes data up; low-confidence fields are flagged.
4. **Review:** nothing is saved until you check the form and tap **Save**.
5. **Store:** the contact is saved in the phone's SQLite database. If backup is on, it syncs to the cloud in the background.

---

## Project status

| Area | Status |
|---|---|
| Sign up, sign in, email codes, protected screens | ✅ Sign-up tested on a real phone |
| Auto-crop scanning + on-device OCR + extraction | ✅ Tested on a real phone |
| Save to phone contacts | ✅ Tested on a real phone |
| Offline storage + cloud backup with per-user security | ✅ Built; cloud access rules verified |
| Multiple phones/emails, labels, country codes | 🧪 Built, awaiting device testing |
| Categories, favourites, Categories tab | 🧪 Built, awaiting device testing |
| Back-side scanning | 🧪 Built, awaiting device testing |
| OCR mistake fixes (`@`, `+`) | 🧪 Built and unit-tested, awaiting device testing |
| Notes, follow-ups + notifications, calendar, events, Event mode | 🧪 Built, awaiting device testing |
| Batch scanning, search everywhere | 🧪 Built, awaiting device testing |
| iOS | ⏳ Later (needs an Apple Developer account) |

**Automated checks:** TypeScript typecheck passes, and **104 unit tests** pass (`npm test`).

---

## Tech stack

| Part | Technology | Why |
|---|---|---|
| App | **Expo SDK 58**, React Native 0.88, React 19, **TypeScript** | One codebase for Android and iOS |
| Navigation | **Expo Router** (file-based) | Screens are files in `src/app`; sign-in protection via `Stack.Protected` |
| Card scanner | `react-native-document-scanner-plugin` (Google ML Kit Document Scanner) | Automatic crop and straighten |
| OCR | `@infinitered/react-native-mlkit-text-recognition` (Google ML Kit) | Fast, free, works offline, on-device |
| Local database | **expo-sqlite** | Offline-first; the phone is the source of truth |
| Backend | **Supabase**: Auth, Postgres, Storage | Login, cloud backup, row-level security |
| Phone numbers | `libphonenumber-js` | Validates and formats numbers for 245 countries |
| Notifications | `expo-notifications` (local only) | Follow-up reminders |
| Phone contacts | `expo-contacts` | Save to the phone's address book |
| Charts | `d3-hierarchy` | Bubble layout in the Categories tab |
| Builds | **EAS Build** | Cloud builds of the Android app |
| Tests | Jest (`jest-expo`) | Unit tests for the logic |

---

## How the app is built

The code is split into layers. Each layer only talks to the one below it:

```
 Screens (src/app)            what you see; no SQL, no business rules
      │
 Services (src/services)      rules: validation, OCR, merging, notifications, sync
      │
 Repositories (src/database)  plain SQL against the phone's SQLite database
      │
 Sync engine (src/sync)       generic: pulls/pushes every table to Supabase
```

Key design decisions:

- **Offline-first.** Every change is written to SQLite immediately and marked `needs_push`. Sync uploads it later, so the app never waits for the network.
- **One database per user** (`smartcard_<userId>.db`), so two accounts on one phone never mix.
- **Soft deletes.** Deleted rows get a `deleted_at` timestamp instead of disappearing, so deletions sync to other devices too.
- **Last write wins** on conflicts, based on `updated_at`.
- **Safe schema upgrades.** Migrations are versioned, run inside a transaction, and back up the database first.
- **Deterministic link IDs.** Contact↔category and contact↔event links use IDs made from both IDs, so two offline phones can't create clashing rows.
- **Native features are guarded.** If a native module is missing (for example in Expo Go), the app shows a friendly message instead of crashing.

---

## Folder structure

```
SmartCardManager/
├── src/
│   ├── app/                  Screens (Expo Router — each file is a route)
│   │   ├── (auth)/           Sign in, sign up, verify email, forgot password
│   │   ├── (tabs)/           Bottom bar: Home, Contacts, Planner, Categories
│   │   ├── contact/[id].tsx  Contact page (Details · Notes · Follow-ups tabs)
│   │   ├── event/[id].tsx    Event page (Event mode, people met)
│   │   ├── scan.tsx          Capture front / back / batch
│   │   ├── processing.tsx    OCR + extraction
│   │   ├── review-contact.tsx Review & edit form
│   │   └── settings.tsx      Account, backup, storage
│   ├── components/           Reusable UI (buttons, sheets, tabs, editors, planner views)
│   ├── services/             Business logic (OCR, extraction, contacts, activity, sync…)
│   ├── database/             SQLite access + migrations
│   ├── sync/                 Generic offline-first sync engine
│   ├── auth/                 Login state (Supabase Auth)
│   ├── utils/                Pure helpers (phones, dates, validation, layouts)
│   ├── data/                 Country list
│   ├── types/                Shared TypeScript types
│   └── constants/theme.ts    Colours, spacing, typography
├── supabase/migrations/      SQL to create the cloud database (run in order)
├── docs/                     Setup, architecture and data-model guides
├── assets/                   App icon and splash
├── app.json                  App config (name, permissions, plugins)
└── eas.json                  Cloud build profiles
```

Unit tests live next to the code in `__tests__` folders.

---

## Getting started

> Full step-by-step instructions, with screenshots of what to click, are in **[docs/SETUP.md](docs/SETUP.md)**. This is the short version.

### What you need
- **Node.js 24** and npm 11
- A free **[Supabase](https://supabase.com)** project
- A free **[Expo](https://expo.dev)** account (for cloud builds)
- An **Android phone**

### 1. Install
```bash
git clone https://github.com/Mansi091/Pockit.git
cd Pockit
npm install
```

### 2. Set up the cloud database
In your Supabase project, open **SQL Editor** and run the files in `supabase/migrations/` **in order** (0001 → 0004).

### 3. Add your keys
Copy `.env.example` to `.env` and fill in your Supabase project values:
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon / publishable key>
```
Only use the **anon/publishable** key. **Never put the `service_role` key in the app.** `.env` is git-ignored.

### 4. Build the app for your phone (once)
OCR, the scanner and notifications are native features, so they need a **development build** (they don't run in Expo Go):
```bash
npx eas login
npx eas build --profile development --platform android
```
Install the APK from the link EAS gives you.

### 5. Run
```bash
npx expo start --dev-client --tunnel
```
Open **Pockit** on your phone, tap **Scan QR Code**, and scan the QR code in the terminal.

> 💡 If the phone and computer are on different networks (or office Wi-Fi blocks them), `--tunnel` still works. It needs `npx expo login` once.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npx expo start --dev-client --tunnel` | Run the app on your phone (development build) |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Check TypeScript types |
| `npx expo-doctor` | Check dependencies and config |
| `npx eas build --profile development --platform android` | New development build (only needed when native packages change) |

**When do I need a new build?** Only when a package with native code is added or `app.json` plugins change. Normal code changes reach your phone instantly through the dev server.

---

## Privacy and security

- **Card images and OCR stay on the phone.** Text recognition runs on the device.
- **Cloud backup is opt-in.** It's off until you turn it on in Settings.
- **Row Level Security on every table.** Each user can only read and write their own rows; anonymous access is blocked.
- **Private image storage:** card images are stored under `cards/<your-user-id>/` and only you can access them.
- **Sessions are stored encrypted** with the phone's secure storage.
- **Notifications are local.** Reminders are scheduled on your phone; nothing goes through a push server. Signing out cancels them.
- **Delete account** removes your cloud data, images and the local database.

---

## Roadmap

**Next: launch preparation**
- [ ] Test all new features on a real phone
- [ ] Email sending through a real mail provider, with email confirmation turned on
- [ ] Crash reporting (Sentry)
- [ ] Privacy policy page
- [ ] Production build and Google Play internal testing
- [ ] Google sign-in (optional)
- [ ] Remove the old single phone/email columns once the new structure is confirmed

**Later**
- [ ] New UI look and font
- [ ] Digital business card with QR code
- [ ] iOS release

---

## More documentation

| Document | What's inside |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Detailed setup: Supabase, email codes, EAS builds, Google sign-in |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the scan flow, sync, navigation, notes, reminders and events work |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Every database table, the migration strategy and sync rules |
