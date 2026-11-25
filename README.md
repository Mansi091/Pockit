<div align="center">

<img src="assets/icon.png" alt="Pockit" width="96" />

# Pockit

**Scan a business card. Pockit reads it, saves the person, reminds you to follow up,<br/>and lets your company see the contacts you choose to share.**

[![Expo](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Website-Vercel-000000?logo=vercel&logoColor=white)](https://pockit-theta.vercel.app)
[![Tests](https://img.shields.io/badge/tests-202%20passing-brightgreen)](#-development)

[**🌐 Live website**](https://pockit-theta.vercel.app) · [**📖 Docs**](docs/) · [**🧪 Test plan**](docs/TEST_PLAN_ROLES.md)

</div>

---

## 📇 About

Pockit is for people who collect business cards at meetings, expos and conferences. Instead of a pile of paper cards, you get a searchable address book that remembers **where** you met each person, **what** you talked about and **when** to get back to them.

One codebase, two ways to use it:

| | 📱 Android app | 🌐 Website |
|---|---|---|
| **Runs on** | Android phones | Any browser, including iPhone Safari |
| **Reads cards with** | Google ML Kit, **on the phone** (offline) | Google Gemini, via a secure server function |
| **Data** | Same account, same contacts, same company features | ← same |

---

## ✨ Features

### 📷 Scanning
- **Auto-crop** on Android (Google document scanner) and **live webcam detection** on the website, with drag-the-corners cropping and **Rescan**
- **Fills the form automatically:** name, company, designation, phones, emails, website and addresses; uncertain fields are flagged, nothing is invented
- **Front and back** of a card merged into one contact
- **Batch scanning:** capture many cards, all read automatically, **Save all**, or join two photos as the front and back of one card

### 👤 Contacts
- Multiple **phone numbers** with types: Mobile, Landline, Office, Direct, Fax, WhatsApp, plus **extensions**
- Multiple **addresses** with labels (Registered office, Branch, Factory…) and City / State / PIN / Country
- Correct **country codes worldwide**; Indian landlines stay Indian
- Duplicate warnings, **Save to phone contacts**, one-tap Call / Email / WhatsApp / Maps

### 🗂️ Organising and follow-ups
- **Categories** with colours and icons, **favourites**, and a visual Categories tab
- **Search everything:** names, numbers, emails, notes, places and events
- **Notes timeline**, **follow-up reminders** with notifications, **calendar**, **events** and **Event mode** for expos

### 🏢 Companies and teams
- **Create a company** or **join with an invite code** (always shown with **Copy** and **Send**)
- Contacts are **private by default**; employees **choose** what to share, even right on the save screen
- **Team dashboard** for the company admin:
  - employees ranked by contacts shared;
  - each person's shared contacts in full detail;
  - shared contacts **by category**;
  - **Excel export**
- **Platform dashboard** for the Pockit owner: users, companies, growth, numbers only

### 🔒 Account and backup
- Email + password with **6-digit verification codes**
- **Offline-first**, with **cloud backup** so a new phone or the website gets everything back
- **Delete account** removes everything everywhere

---

## 👥 Who sees what

| Role | Sees | Never sees |
|---|---|---|
| **Personal user** | Their own contacts | Anyone else's data |
| **Member** | Their own contacts; chooses what to share | Colleagues' contacts, the team list |
| **Company admin** | Their own contacts + contacts employees **shared** | Private contacts, **how many** there are, notes, follow-ups |
| **Platform owner** | Platform-wide numbers and growth | Anyone's actual contacts |

All of these rules are enforced **in the database** with Row Level Security, not just on screen.

---

## 🛠️ Tech stack

| Layer | Tools |
|---|---|
| **App and website** | Expo SDK 58 · React Native 0.88 · React Native Web · React 19 · TypeScript · Expo Router |
| **Scanning (Android)** | Google ML Kit Document Scanner · Google ML Kit Text Recognition |
| **Scanning (website)** | OpenCV.js in a Web Worker · Google Gemini via Supabase Edge Function |
| **Data** | SQLite on the device (WebAssembly in the browser) · offline-first sync engine |
| **Backend** | Supabase: Auth · Postgres with Row Level Security · Storage · Edge Functions |
| **Other** | libphonenumber-js · expo-notifications · expo-contacts · d3-hierarchy |
| **Delivery** | EAS Build (Android) · Vercel (website) · Jest (tests) |

---

## 🔄 How a scan works

```
 Android:  Doc scanner ─▶ ML Kit OCR (on phone) ─▶ Extraction rules ─┐
                                                                     ├─▶ Review form ─▶ SQLite ⇄ Supabase
 Website:  Webcam / upload ─▶ Corner crop ─▶ scan-card ─▶ Gemini ────┘
```

Nothing is saved until you check the form and tap **Save**. Data is written to the device first and synced to the cloud in the background.

<details>
<summary><b>More detail</b></summary>

1. **Capture:** a cropped, straightened card image.
2. **Read:** on Android, ML Kit reads it on the phone. On the website, the image (at most 2000 px, JPEG) goes to the `scan-card` Edge Function, which asks Gemini. The Gemini key stays on the server.
3. **Extraction:** [`extractionService.ts`](src/services/extractionService.ts), [`phoneExtraction.ts`](src/services/phoneExtraction.ts) and [`addressExtraction.ts`](src/services/addressExtraction.ts) decide the name, company, each phone with its type and each address with its label. Low-confidence fields are flagged.
4. **Review and save:** you check the form, choose whether to share with your company, and save.
5. **Sync:** every change is marked `needs_push` and uploaded later; conflicts are resolved by last write wins.

</details>

---

## 🚀 Getting started

### Prerequisites
- **Node.js 24** and npm 11
- A **[Supabase](https://supabase.com)** project
- An **[Expo](https://expo.dev)** account (for Android builds)
- A **Google Gemini API key** (for website scanning)

### 1. Clone and install
```bash
git clone https://github.com/Mansi091/Pockit.git
cd Pockit
npm install
```

### 2. Configure
```bash
cp .env.example .env
```
```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon / publishable key>
```
> ⚠️ Use only the **anon/publishable** key. **Never** put the `service_role` key or the Gemini key in `.env` with an `EXPO_PUBLIC_` name.

### 3. Set up Supabase
1. **SQL Editor:** run every file in [`supabase/migrations/`](supabase/migrations/) in order, **0001 → 0008**.
2. **Edge Functions:** create **`scan-card`** from [`supabase/functions/scan-card/index.ts`](supabase/functions/scan-card/index.ts) and deploy it.
3. **Edge Functions → Secrets:** add `GEMINI_API_KEY`.

### 4. Run
**Website**
```bash
npx expo start --web        # → http://localhost:8081
```

**Android app.** OCR and the scanner are native, so build a development app once:
```bash
npx eas build --profile development --platform android
npx expo start --dev-client --tunnel
```
Then open Pockit on the phone and scan the QR code.

<details>
<summary><b>Make yourself the platform owner</b></summary>

After signing up, run this in the Supabase SQL Editor:
```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```
</details>

---

## 🌐 Deployment

The website is hosted on **Vercel** and redeploys automatically on every push to `main`.

1. Import the repo in Vercel and choose the **Other** preset. [`vercel.json`](vercel.json) handles the build and the required headers.
2. Add the environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. In Supabase → **Authentication → URL Configuration**, add your Vercel URL.

---

## 📁 Project structure

```
src/
├── app/            Screens (Expo Router): auth, tabs, contact, scan, batch, company, team…
├── web/            Website-only code: sidebar, webcam scanner, web overrides
├── components/     Reusable UI
├── services/       Business logic: OCR, extraction, contacts, companies, team, sync
├── database/       SQLite access and migrations
├── sync/           Offline-first sync engine
├── auth/  utils/  types/  data/  constants/
supabase/
├── migrations/     Cloud database (0001 → 0008)
└── functions/      scan-card Edge Function (Gemini)
docs/               Architecture, data model, setup, test plans
```

> **App vs website:** website-only code lives in `src/web/`. Website versions of shared files live in `src/web/overrides/` and are swapped in by [`metro.config.js`](metro.config.js) for the web build only. See [`src/web/README.md`](src/web/README.md).

---

## 🧪 Development

| Command | Description |
|---|---|
| `npx expo start --web` | Run the website locally |
| `npx expo start` | Run everything (press **w** for web, scan the QR for the app) |
| `npx expo start --clear` | Same, with a fresh cache |
| `npm test` | Run the unit tests (202 passing) |
| `npm run typecheck` | TypeScript check |
| `npx eas build --profile development --platform android` | New Android dev build (only when native packages change) |

---

## 🔐 Privacy and security

- 📱 **Android:** card images and text recognition **never leave the phone** (unless cloud backup is on).
- 🌐 **Website:** card images are sent to **Google Gemini** through our server function to be read; the key never reaches the browser.
- 🛡️ **Row Level Security on every table:** users only access their own rows.
- 🤝 **Sharing is opt-in, per contact.** Company admins can only *read* shared contacts.
- 📊 **The platform owner sees numbers only.**
- 🗑️ **Delete account** removes cloud data, images and the local database.

---

## 🗺️ Roadmap

- [x] Android app with on-device OCR
- [x] Website with webcam scanning
- [x] Companies, opt-in sharing, team and platform dashboards
- [x] Multiple addresses, phone types, front + back batch scanning
- [ ] Real-device test round (iPhone website, new features)
- [ ] Production Android release (Google Play)
- [ ] Native iOS app
- [ ] Digital business card with QR code
- [ ] New UI look

---

## 📚 Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Scan flow, sync, navigation, website |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, migrations, sync rules |
| [SETUP.md](docs/SETUP.md) | Detailed setup: Supabase, email codes, builds |
| [TEST_PLAN_ROLES.md](docs/TEST_PLAN_ROLES.md) | Step-by-step test plan for all roles |
| [PROJECT_HANDOFF.md](docs/PROJECT_HANDOFF.md) | Project history and where to continue |

---

<div align="center">

Made with ❤️ by **[Mansi091](https://github.com/Mansi091)**

</div>
