# Pockit — Setup Guide

Follow these steps in order. Steps 1–3 get the app running in **Expo Go**
(accounts, camera, gallery, database, phone contacts, cloud backup).
Step 4 creates the **development build** needed for on-device OCR (ML Kit)
and Step 5 adds **Google sign-in**.

---

## 1. Create the Supabase backend (≈10 min)

1. Go to <https://supabase.com> → sign up → **New project**.
   Name it `smartcard-dev`, pick the region closest to you, save the database password.
2. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key.
   *Never* copy the `service_role` / secret key into the app.
3. Open `.env` in the project root and fill in:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ... (or sb_publishable_...)
   ```
4. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → **Run**.
   This creates the `contacts` table, Row Level Security, the private `cards`
   storage bucket and the `delete_my_account` function.

### 1b. Apply the v2 cloud update + table grants (required for app versions with P7.0+)
**SQL Editor → New query** → paste all of `supabase/migrations/0002_structured_data.sql` → **Run**.
It only *adds* tables/columns (phones, emails, categories, events, notes, reminders, favourites,
back-side images) with the same per-user security. Until it's run, Settings → Cloud backup shows
"cloud database needs update". See docs/DATA_MODEL.md.

Then run `supabase/migrations/0003_table_grants.sql` the same way. Some Supabase projects are created
without automatic table permissions; this grants signed-in users access (RLS still limits them to
their own rows) and gives anonymous visitors none.

Then run `supabase/migrations/0004_phone_label_personal.sql` (P8) — it allows the "Personal" phone label.

Then run `supabase/migrations/0005_organizations.sql` — companies, roles (admin/member), invite codes and opt-in contact sharing. **Run it before using an app version that has Settings → Company**: the app now syncs a `shared_with_org` column, and sync pauses with a "cloud update needed" message until 0005 is applied.

## 2. Switch auth emails to 6-digit codes

The app asks users to type a code from the email (works everywhere, no deep links).

**Authentication → Email Templates** (called *Emails → Templates* in newer dashboards):

- **Confirm signup** — replace the body with:
  ```html
  <h2>Confirm your email</h2>
  <p>Your Pockit verification code is:</p>
  <h1>{{ .Token }}</h1>
  ```
- **Reset Password** — replace the body with:
  ```html
  <h2>Reset your password</h2>
  <p>Your Pockit reset code is:</p>
  <h1>{{ .Token }}</h1>
  ```

Also check **Authentication → Sign In / Providers → Email**: *Confirm email* should be **ON**.

> **Email limits:** Supabase's built-in email sender only allows a few emails per hour
> and is meant for testing. Before real users, add your own SMTP provider
> (e.g. Resend, Brevo, Amazon SES) under **Authentication → SMTP Settings**.

## 3. Run in Expo Go

```
cd D:\CARD-PROJECT\SmartCardManager
npx expo start --go --clear
```
Scan the QR code with **Expo Go** (Play Store). Phone and PC on the same Wi-Fi;
otherwise add `--tunnel`.

What works in Expo Go: sign up / verify / sign in / forgot password / sign out /
delete account, camera, gallery, review & edit, SQLite, search & filter,
duplicate detection, **save to phone contacts**, cloud backup.
What doesn't: automatic text reading (OCR) and Google sign-in — the app tells you
and offers manual entry instead.

## 4. Development build (ML Kit OCR) — EAS cloud build

No Android Studio needed; Expo's servers build the APK.

```
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest init             # links the project (adds projectId to app.json)
npx eas-cli@latest build --profile development --platform android
```
When it finishes (~10–20 min) open the link on your phone and install the APK.
Then on the PC:
```
npx expo start --dev-client
```
Open the **Pockit** app on the phone (not Expo Go) — it connects to
your PC and loads the latest code. `.env` is read from your PC, so no extra setup.

> For **preview/production** builds the JavaScript is bundled on Expo's servers,
> where `.env` (git-ignored) is not available. Add the same variables with
> `npx eas-cli@latest env:create` for the `preview` / `production` environments.

The first native build is also where the ML Kit module's Gradle setup is
verified — if the build fails, send me the build log.

## 5. Google sign-in (optional, needs Step 4)

1. **Google Cloud Console** → create a project → **APIs & Services → OAuth consent screen**
   (External, app name, support email).
2. **Credentials → Create credentials → OAuth client ID**:
   - **Web application** → copy its **Client ID**.
   - **Android** → package name `com.supremefacility.pockit`, SHA-1 from
     `npx eas-cli@latest credentials` (Android → development keystore).
3. Supabase → **Authentication → Sign In / Providers → Google** → enable →
   paste the **Web** client ID (and the Android one) into *Client IDs* → save.
4. `.env`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>` → restart `npx expo start --dev-client`.
5. If sign-in fails with a *nonce* error, enable **Skip nonce check** on the Supabase Google provider page.

The *Continue with Google* button appears automatically once 2–4 are done.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npx expo start --dev-client` | Run with the development build |
| `npx expo start --go` | Run in Expo Go |
| `npm test` | Unit tests (extraction, validation, session storage) |
| `npm run typecheck` | TypeScript check |
| `npx expo-doctor` | Dependency / config health check |
