# Pockit

**Scan a business card. Pockit reads it, saves the person, reminds you to follow up, and lets your company see the contacts you choose to share.**

Pockit is for people who collect business cards at meetings, expos and conferences. Instead of a pile of paper cards, you get a searchable address book that remembers *where* you met each person, what you talked about, and *when* to get back to them.

It comes in two forms built from **one codebase**:

| | Where | Reads cards with |
|---|---|---|
| **Android app** | Installed on the phone | Google ML Kit, **on the phone** (works offline) |
| **Website** | Any browser, including iPhone Safari: https://pockit-theta.vercel.app | Google Gemini, through our own server function |

Both use the same account, the same contacts and the same company features.

---

## Contents

1. [What Pockit does](#what-pockit-does)
2. [Who sees what (roles)](#who-sees-what-roles)
3. [How a scan works](#how-a-scan-works)
4. [Project status](#project-status)
5. [Tech stack](#tech-stack)
6. [How the code is organised](#how-the-code-is-organised)
7. [Folder structure](#folder-structure)
8. [Getting started](#getting-started)
9. [Deploying the website](#deploying-the-website)
10. [Everyday commands](#everyday-commands)
11. [Privacy and security](#privacy-and-security)
12. [Roadmap](#roadmap)
13. [More documentation](#more-documentation)

---

## What Pockit does

### Scanning
- **Android app:** Google's document scanner finds the card's edges, crops and straightens it, then **ML Kit reads the text on the phone**.
- **Website:** live **webcam scanner** that finds the card automatically (OpenCV, running in the background so the page never freezes), plus **drag-the-corners** cropping and **Rescan**. Uploaded photos work too. The text is read by Google Gemini.
- **Fills the form for you:** name, company, designation, phone numbers, emails, website and addresses. Anything uncertain is marked *"please check this"*. Nothing is ever invented.
- **Fixes common OCR mistakes,** such as an `@` read as letters or a `+91` read as `491`.
- **Both sides of a card:** add the back side and Pockit merges it. The front always wins; the back only adds what's new.
- **Batch scanning:** capture many cards, all are read automatically, then **Save all** or check each one. Two photos can be joined as the **front and back of one card** ("Back of card N"), and separated again.
- **Manual options:** pick from the gallery, crop yourself, or type the details by hand.

### Contacts
- **Several phone numbers** per person, each with a type: **Mobile, Landline, Office, Direct, Fax, WhatsApp** and more, plus an optional **extension**.
  - Country codes are added only when the country is certain. Indian landlines like `044 2345 6789` stay Indian; international numbers (UK, UAE, Singapore, US…) keep their own format.
- **Several emails** per person, with labels.
- **Several addresses** per person, each with a label (**Registered office, Corporate, Head office, Branch, Factory / Plant, Warehouse, Home…**) and City, State, PIN and Country.
- **Duplicate warning** when a phone or email already exists.
- **Save to phone contacts** in one tap (Android), with the card image as the photo.
- One-tap **Call, Email, WhatsApp, Maps and Website**.

### Organising
- **Categories** (Clients, Vendors, Family…) with colours and icons. A person can be in several.
- **⭐ Favourites,** shown on Home.
- **Categories tab:** bubbles, connections and list views.
- **Search everything:** name, company, phone digits, email, address, category, notes, meeting place and event.

### Remembering and following up
- **Notes:** a timeline per person of where you met and what you talked about.
- **Follow-up reminders** with phone notifications (*Tomorrow*, *In 3 days*, *Next week*, or an exact time).
- **Planner tab:** Follow-ups (overdue, today, upcoming, done), a **Calendar** and **Events**.
- **Event mode:** at an expo, every card you scan is added to that event automatically.

### Companies and teams
- Anyone can **create a company** (they become its admin) or **join one with an 8-character invite code**.
- The company page always shows the **current invite code** with **Copy** and **Send**.
- **Contacts are private by default.** An employee shares a contact by choice:
  - on the **save screen** ("Share with *company*"),
  - on the contact's page, or
  - automatically, if they turn on "Share new contacts automatically".
- **Team dashboard** for company admins (CEO):
  - employees ranked by how many contacts they shared;
  - click an employee to see their **shared contacts with full details** (name, company, numbers, emails, website, addresses, categories);
  - **shared contacts by category**, across the whole team;
  - **Excel download** of everything, one employee, or one category.

### Platform dashboard (Pockit owner)
- Numbers for the whole platform: people using Pockit, active users, companies, contacts and shares, and monthly growth.
- Lists of companies and people, with search.
- **Numbers only.** It never shows anyone's contacts.

### Account and backup
- Sign up with email and password, verified with a **6-digit code**. Sign-in by code and password reset by code also work.
- **Works offline.** Data lives on the device first.
- **Cloud backup** (opt-in on the phone, always on for the website). Contacts, card images and everything else sync, so a new phone or the website gets them back.
- **Delete account** removes everything, from the device and the cloud.

---

## Who sees what (roles)

| Role | Who | Sees | Never sees |
|---|---|---|---|
| **Personal user** | Anyone without a company | Their own contacts | Anything of anyone else |
| **Member** | Employee who joined with a code | Their own contacts; chooses what to share | Other people's contacts, the team list |
| **Company admin** | CEO / manager of a company | Their own contacts, plus contacts employees **shared**, with categories; team list; invite codes | Employees' private contacts, **how many** private contacts they have, anyone's notes or follow-ups |
| **Platform owner** | Pockit's owner | Platform-wide numbers and growth | Anyone's actual contacts |

These rules are enforced **in the database** (Row Level Security and checked functions), not only on screen.

On the website, each role opens on its own page after sign-in: the platform owner on **Dashboard**, a company admin on **Team**, everyone else on **Home**. Nothing on screen labels an account as the platform owner.

---

## How a scan works

```
 ANDROID APP                                         WEBSITE
 ┌──────────────┐  ┌──────────────┐                  ┌──────────────┐  ┌───────────────────┐
 │ Doc scanner  │─▶│ ML Kit OCR   │                  │ Webcam/upload│─▶│ Corner crop       │
 │ (auto-crop)  │  │ on the phone │                  │ + auto-detect│  │ (OpenCV, worker)  │
 └──────────────┘  └──────┬───────┘                  └──────────────┘  └─────────┬─────────┘
                          ▼                                                      ▼
                 ┌──────────────────┐                          ┌──────────────────────────────┐
                 │ Extraction rules │                          │ Edge Function `scan-card`    │
                 │ (name, phones,   │                          │ → Google Gemini (key stays   │
                 │ emails, addresses)│                         │   on the server)             │
                 └────────┬─────────┘                          └──────────────┬───────────────┘
                          └───────────────────┬───────────────────────────────┘
                                              ▼
                                    ┌───────────────────┐
                                    │ Review form       │  you check, choose sharing, save
                                    └─────────┬─────────┘
                                              ▼
                 ┌──────────────────────────┐      sync      ┌──────────────────────────────┐
                 │ SQLite on the device     │ ◀────────────▶ │ Supabase: Postgres + private │
                 │ (source of truth)        │                │ image storage + RLS          │
                 └──────────────────────────┘                └──────────────────────────────┘
```

1. **Capture:** a cropped, straightened image of the card.
2. **Read:** on Android, ML Kit reads it on the phone. On the website, the image (shrunk to at most 2000 px, converted to JPEG) goes to the `scan-card` function, which asks Gemini and returns the fields.
3. **Extraction** ([`src/services/extractionService.ts`](src/services/extractionService.ts), with [`phoneExtraction.ts`](src/services/phoneExtraction.ts) and [`addressExtraction.ts`](src/services/addressExtraction.ts)): rules decide the name, company, each phone with its type, each address with its label. Low-confidence fields are flagged.
4. **Review:** nothing is saved until you check the form and tap **Save**.
5. **Store:** saved in the device's SQLite database first, then synced to the cloud.

---

## Project status

| Area | Status |
|---|---|
| Sign up, sign in, email codes, protected screens | ✅ Tested |
| Android: auto-crop scanning, on-device OCR, extraction | ✅ Tested on a real phone |
| Website: deployed on Vercel, sign-in, webcam scanning with Gemini | ✅ Working on desktop |
| Website on iPhone (layout fixes, photo conversion) | 🧪 Fixed, needs a real-iPhone retest |
| Cloud backup with per-user security | ✅ Built; access rules verified |
| Companies, invite codes, sharing, Team dashboard, Excel export | ✅ Tested on the website |
| Platform dashboard | ✅ Tested on the website |
| Category view and privacy update (0008) | 🧪 Built, needs a test after running 0008 |
| Multiple addresses, phone types, extensions (0007) | 🧪 Built and unit-tested, needs device testing |
| Batch scan with front + back joining | 🧪 Built and unit-tested, needs device testing |
| Notes, follow-ups, calendar, events, Event mode | 🧪 Built, needs device testing |
| Native iOS app | ⏳ Later (needs an Apple Developer account); iPhone users use the website |

**Automated checks:** TypeScript typecheck passes, and **202 unit tests** pass (`npm test`).

---

## Tech stack

| Part | Technology | Why |
|---|---|---|
| App and website | **Expo SDK 58**, React Native 0.88, React 19, React Native Web, **TypeScript** | One codebase for Android and the browser (iOS later) |
| Navigation | **Expo Router** (file-based) | Screens are files in `src/app`; sign-in protection via `Stack.Protected` |
| Android scanner | `react-native-document-scanner-plugin` (Google ML Kit Document Scanner) | Automatic crop and straighten |
| Android OCR | `@infinitered/react-native-mlkit-text-recognition` (Google ML Kit) | Free, offline, on the device |
| Website scanner | **OpenCV.js 4.10** in a Web Worker + our own perspective crop | Finds the card in the webcam image without freezing the page |
| Website OCR | **Google Gemini** via a **Supabase Edge Function** (`scan-card`) | Accurate, returns fields directly; the API key never reaches the browser |
| Local database | **expo-sqlite** (in the browser: SQLite in WebAssembly) | Offline-first; the device is the source of truth |
| Backend | **Supabase**: Auth, Postgres, Storage, Edge Functions | Login, cloud backup, companies, row-level security |
| Phone numbers | `libphonenumber-js` | Validates, types and formats numbers worldwide |
| Notifications | `expo-notifications` (local only) | Follow-up reminders |
| Phone contacts | `expo-contacts` | Save to the phone's address book |
| Charts | `d3-hierarchy` | Bubble layout in the Categories tab |
| Builds and hosting | **EAS Build** (Android), **Vercel** (website) | Cloud builds and automatic website deploys |
| Tests | Jest (`jest-expo`) | Unit tests for the logic |

---

## How the code is organised

The code is split into layers. Each layer only talks to the one below it:

```
 Screens (src/app)            what you see; no SQL, no business rules
      │
 Services (src/services)      rules: OCR, extraction, merging, sharing, notifications, sync
      │
 Repositories (src/database)  plain SQL against the device's SQLite database
      │
 Sync engine (src/sync)       generic: pulls/pushes every table to Supabase
```

**App vs website.** Everything that exists only for the website lives in **`src/web/`**. Where the website needs a different version of a shared file (OCR, camera, images, storage, sync, date picker), that version sits in `src/web/overrides/` at the same path, and [`metro.config.js`](metro.config.js) swaps it in for the web build only. The Android build never includes web code. See [`src/web/README.md`](src/web/README.md).

Key design decisions:
- **Offline-first.** Every change is written to SQLite immediately and marked `needs_push`; sync uploads it later.
- **One database per user** (`smartcard_<userId>.db`), so two accounts on one device never mix.
- **Soft deletes.** Deleted rows get a `deleted_at` timestamp, so deletions sync too.
- **Last write wins** on conflicts, based on `updated_at`.
- **Safe schema upgrades.** Migrations are versioned, run inside a transaction, back up the database first, and check that data was copied (for example, old single addresses into the new address list).
- **Deterministic IDs** for links and migrated rows, so two offline devices can't create clashing rows.
- **Company rules live in the database.** Joining, leaving, invites and role changes only happen through checked database functions; admins can only *read* shared contacts.

---

## Folder structure

```
SmartCardManager/
├── src/
│   ├── app/                    Screens (Expo Router — each file is a route)
│   │   ├── (auth)/             Sign in, sign up, codes, forgot password
│   │   ├── (tabs)/             Home, Contacts, Planner, Categories
│   │   │   ├── team.tsx        Company admin: Team dashboard
│   │   │   └── admin.tsx       Platform dashboard
│   │   ├── contact/[id].tsx    Contact page (Details · Notes · Follow-ups)
│   │   ├── event/[id].tsx      Event page
│   │   ├── scan.tsx            Capture front / back / batch
│   │   ├── batch.tsx           Batch of cards: read all, join front + back, save all
│   │   ├── processing.tsx      OCR + extraction
│   │   ├── review-contact.tsx  Review & edit form (with "Share with company")
│   │   ├── company.tsx         Create / join a company, invite code, team
│   │   └── settings.tsx        Account, backup, storage
│   ├── web/                    Website-only code (sidebar, webcam scanner, web overrides)
│   ├── components/             Reusable UI (buttons, sheets, tabs, editors, planner views)
│   ├── services/               Business logic (OCR, extraction, contacts, companies, team, sync…)
│   ├── database/               SQLite access + migrations
│   ├── sync/                   Offline-first sync engine
│   ├── auth/                   Login state (Supabase Auth)
│   ├── utils/                  Pure helpers (phones, dates, validation, IDs)
│   ├── data/                   Country list
│   ├── types/                  Shared TypeScript types
│   └── constants/theme.ts      Colours, spacing, typography
├── supabase/
│   ├── migrations/             SQL for the cloud database (run in order, 0001 → 0008)
│   └── functions/scan-card/    Edge Function: reads cards with Gemini for the website
├── public/index.html           Website page template (iPhone screen-size fixes)
├── docs/                       Setup, architecture, data model, test plans, handoff
├── metro.config.js             Bundler config (web overrides, SQLite in the browser)
├── vercel.json                 Website hosting config (build + required headers)
├── app.json                    App config (name, permissions, plugins)
└── eas.json                    Android cloud build profiles
```

Unit tests live next to the code in `__tests__` folders.

---

## Getting started

> Full step-by-step instructions are in **[docs/SETUP.md](docs/SETUP.md)**. This is the short version.

### What you need
- **Node.js 24** and npm 11
- A free **[Supabase](https://supabase.com)** project
- A free **[Expo](https://expo.dev)** account (for Android builds)
- A **Google Gemini API key** (for scanning on the website)
- An **Android phone** for the app; any browser for the website

### 1. Install
```bash
git clone https://github.com/Mansi091/Pockit.git
cd Pockit
npm install
```

### 2. Set up the cloud database
In Supabase, open **SQL Editor** and run every file in `supabase/migrations/` **in order**, from `0001` to `0008`.

### 3. Set up website scanning
1. Supabase → **Edge Functions** → create a function named **`scan-card`** and paste [`supabase/functions/scan-card/index.ts`](supabase/functions/scan-card/index.ts) → **Deploy**.
2. **Edge Functions → Secrets** → add `GEMINI_API_KEY` with your Gemini key. Optional: `GEMINI_MODEL` to pin a model.

### 4. Add your keys
Copy `.env.example` to `.env` and fill in your Supabase project values:
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon / publishable key>
```
- Only use the **anon/publishable** key. **Never put the `service_role` key in the app.**
- **Never put the Gemini key in `.env` with an `EXPO_PUBLIC_` name**; it belongs only in Supabase secrets.
- `.env` is git-ignored.

### 5. Run the website
```bash
npx expo start --web
```
Opens http://localhost:8081.

### 6. Run the Android app
OCR, the scanner and notifications are native features, so they need a **development build** (not Expo Go). Build once:
```bash
npx eas login
npx eas build --profile development --platform android
```
Install the APK from the link, then:
```bash
npx expo start --dev-client --tunnel
```
Open **Pockit** on the phone → **Scan QR Code**.

### 7. Make yourself the platform owner (optional)
After signing up, run this in the SQL Editor with your email:
```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

---

## Deploying the website

The website is hosted on **Vercel** and rebuilds automatically on every push to `main`.

1. Vercel → **Add New → Project** → import the GitHub repo. Framework preset: **Other**. Leave the build settings alone; [`vercel.json`](vercel.json) sets them.
2. **Environment Variables:** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (no quotes, no spaces).
3. **Deploy.**
4. Supabase → **Authentication → URL Configuration:** set the Site URL to your Vercel address and add `https://<your-site>/**` to Redirect URLs.

`vercel.json` also sends two security headers (cross-origin isolation) that the in-browser SQLite database needs.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npx expo start --web` | Run the website locally (http://localhost:8081) |
| `npx expo start` | Run both: press **w** for the website, open the app on the phone |
| `npx expo start --clear` | Same, with a fresh build cache |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Check TypeScript types |
| `npx eas build --profile development --platform android` | New Android development build (only when native packages change) |
| `git push` | Publish the website (Vercel rebuilds automatically) |

**When do I need a new Android build?** Only when a package with native code is added or `app.json` plugins change. Normal code changes reach the phone instantly (shake → **Reload**).

Run only **one** `expo start` at a time.

---

## Privacy and security

- **Android: card images and OCR stay on the phone.** Text recognition runs on the device.
- **Website: card images are sent to Google Gemini** through our server function to be read. The Gemini key never reaches the browser, and only signed-in users can call it.
- **Row Level Security on every table.** Each user can only read and write their own rows; anonymous access is blocked.
- **Company sharing is opt-in, per contact.** Admins can only *read* shared contacts. They never see private contacts, how many private contacts someone has, notes or follow-ups.
- **The platform owner sees numbers only,** never contacts.
- **Private image storage:** card images are stored under `cards/<user-id>/`; only the owner (and their company admins, for shared contacts) can read them.
- **Excel exports** neutralise formula injection.
- **Sessions are stored encrypted** on the phone (secure storage).
- **Notifications are local;** nothing goes through a push server.
- **Delete account** removes cloud data, images and the local database.

---

## Roadmap

**Next**
- [ ] Retest the website on a real iPhone
- [ ] Device-test 0007 (addresses, phone types), 0008 (categories, privacy) and batch front/back joining
- [ ] Turn on cloud backup by default in the phone app, or make it clearer
- [ ] Optional: invite codes that never expire
- [ ] Crash reporting (Sentry) and a privacy policy page
- [ ] Production Android build and Google Play internal testing
- [ ] Supabase Pro (Mumbai region) and a company email domain for sign-in emails

**Later**
- [ ] Native iOS app (same ML Kit; needs an Apple Developer account)
- [ ] New UI look
- [ ] Digital business card with QR code

---

## More documentation

| Document | What's inside |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Detailed setup: Supabase, email codes, EAS builds, Google sign-in |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Scan flow, sync, navigation, website, notes, reminders and events |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Every database table, the migration strategy and sync rules |
| [docs/TEST_PLAN_ROLES.md](docs/TEST_PLAN_ROLES.md) | Step-by-step test plan for all four roles |
| [docs/PROJECT_HANDOFF.md](docs/PROJECT_HANDOFF.md) | Project history and where to continue, for new developers or agents |
| [src/web/README.md](src/web/README.md) | How the website-only code and overrides work |
