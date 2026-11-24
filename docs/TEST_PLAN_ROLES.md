# Pockit — Role & Permission Test Plan

Tests the four user levels and what each one can and cannot see.
Work top to bottom. Tick each box and write what you saw in **Notes** when something differs from **Expected**.

| Level | Test account (suggested) | Role in this test |
|---|---|---|
| **Super Admin** | **A** — your own account | Pockit owner; also admin of *Supreme facility Management* |
| **Company Admin** | **B** — `yourname+ceo@gmail.com` | Creates company **"Test Co"** |
| **Member** | **C** — `yourname+staff@gmail.com` | Joins **Test Co** with an invite code |
| **Personal user** | **D** — `yourname+solo@gmail.com` | No company |

> **Tip — one inbox, many accounts:** Gmail ignores everything after `+`, so `yourname+ceo@gmail.com` arrives in your normal inbox but is a separate Pockit account. Use your real Gmail name instead of `yourname`.
>
> **Two at once:** sign in as one account in a normal browser window and another in a **private / InPrivate window** (or on the phone). Private windows keep separate logins.

---

## 0. Setup (once)

| # | Step | Expected | ✓ |
|---|---|---|---|
| 0.1 | Supabase → **pockit** project (`vwajietuzpiiqwgkljax`) → SQL Editor: **0005** has been run | Earlier "Success" — Company page works | ☐ |
| 0.2 | Run **`0006_super_admin.sql`** | "Success. No rows returned" | ☐ |
| 0.3 | Run `insert into public.platform_admins (user_id) select id from auth.users where email = 'A-EMAIL' on conflict do nothing;` | "Success. 1 row" | ☐ |
| 0.4 | Edge Function **scan-card** deployed + secret **GEMINI_API_KEY** set | Website scan fills in fields | ☐ |
| 0.5 | Start the website: `npx expo start --web` → `localhost:8081` | Sign-in page with the dark side panel | ☐ |
| 0.6 | Sign up **B**, **C**, **D** (Create an account → name, email, password) | Each lands on Home: "Your network, <first name>." | ☐ |

---

## 1. Features every user has (do quickly as **D**, then spot-check others)

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 1.1 | Home | Greeting with first name; tiles Contacts / Companies / Cards scanned / Follow-ups | ☐ | |
| 1.2 | **Scan a card → Scan with webcam**, scan a card | Green outline → auto-capture → corner screen → **Crop & use** → review form filled | ☐ | |
| 1.3 | **Upload a photo** of another card | Corner screen with auto-detected corners → review form | ☐ | |
| 1.4 | Save both contacts | Contacts tab shows 2; Home "Recently added" shows them | ☐ | |
| 1.5 | Open a contact → **Notes** tab → add a note | Note appears in the timeline | ☐ | |
| 1.6 | **Follow-ups** tab → add one for tomorrow | Shows in Planner → Follow-ups → Upcoming | ☐ | |
| 1.7 | Categories → add a category, put a contact in it | Bubble appears with count 1 | ☐ | |
| 1.8 | Search for part of a phone number / a word from the note | The right contact is found | ☐ | |
| 1.9 | Settings → **Your name** → change it → Save | Greeting and sidebar update | ☐ | |
| 1.10 | Open the **phone app** with the same account (backup on) | The same contacts appear after a sync | ☐ | |

---

## 2. Personal user — **D**

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 2.1 | Open a contact → Details tab | **No** "Share with company" switch | ☐ | |
| 2.2 | Sidebar | **No** "🛡 Super Admin" link; Company item says "Company" | ☐ | |
| 2.3 | Settings / sidebar → **Company** | "Work with your team" with **Join with a code / Create a company** | ☐ | |
| 2.4 | Type `localhost:8081/admin` in the address bar | **"Super Admin only"** page — no numbers shown | ☐ | |

---

## 3. Company Admin — **B**

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 3.1 | Company → **Create a company** → name "Test Co", your name | Pockit dialog "Test Co is ready"; page shows "You are an admin" | ☐ | |
| 3.2 | **Create an invite code** | An 8-character code (e.g. `52840EDD`), "Valid for 14 days" | ☐ | |
| 3.3 | Note the code down for test 4.1 | — | ☐ | |
| 3.4 | Team section | Only B: "B · Admin — 0 shared · N saved" | ☐ | |
| 3.5 | Sidebar | **No** "🛡 Super Admin" link | ☐ | |
| 3.6 | `localhost:8081/admin` | **"Super Admin only"** | ☐ | |

---

## 4. Member — **C**

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 4.1 | Company → **Join with a code** → B's code + your name | "You joined Test Co"; page says "You are a member" | ☐ | |
| 4.2 | Company page | Sees **Your sharing** only — **no** Invite people, **no** Team list | ☐ | |
| 4.3 | Scan / add **2 contacts** (Contact-1, Contact-2) | Saved | ☐ | |
| 4.4 | Open Contact-1 → Details | Switch **"Share with Test Co"** is **OFF** (🔒 "Private — only you can see this contact") | ☐ | |
| 4.5 | Turn the switch **ON** for Contact-1 only | Text changes to "Your company admins can see this contact…" | ☐ | |
| 4.6 | Company page | "**1** contact shared with Test Co" | ☐ | |
| 4.7 | Turn on **Share new contacts automatically**, add Contact-3 | Contact-3's switch is already **ON** | ☐ | |
| 4.8 | As **D**, Company → Join with the made-up code `ABCD1234` | "This invite code is not valid or has expired." (D stays a personal user) | ☐ | |
| 4.9 | As **C**, try to join another company code (e.g. A's company code) | "You are already in a company. Leave it first." | ☐ | |

---

## 5. Company Admin sees the team — back to **B**

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 5.1 | Company → Team (refresh the page) | **C — 2 shared · 3 saved** (Contact-1 and Contact-3 shared) | ☐ | |
| 5.2 | B's **Contacts** tab | Shows only **B's own** contacts — **none** of C's | ☐ | |
| 5.3 | Press-and-hold on C in the Team list → **Make admin** | C shows "· Admin" | ☐ | |
| 5.4 | Press-and-hold on C → **Make member** | Back to member | ☐ | |
| 5.5 | (Optional) Press-and-hold on C → **Remove from company** | C disappears from the team; on C's Company page (refresh) → join screen again; C's contacts are private again | ☐ | |
| 5.6 | If you did 5.5, re-invite C (new code) so later tests still work | C back in Test Co | ☐ | |

> The **list of shared contacts with full details + Excel download** for Company Admins is the next feature to build — it is not in this test yet. Section 7 checks the underlying permission directly in the database.

---

## 6. Super Admin — **A** (you)

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 6.1 | Sign in as A (or refresh) | Sidebar shows green **🛡 Super Admin** | ☐ | |
| 6.2 | Click **Super Admin** → **Overview** | Tiles: People using Pockit = **4**, Companies = **2**, Contacts connected = total of everyone's backed-up contacts, Shared with companies ≥ **2** | ☐ | |
| 6.3 | Growth chart | This month's bars show the new people and contacts | ☐ | |
| 6.4 | **Companies** tab | *Supreme facility Management* and *Test Co* with people / admins / contacts / shared counts | ☐ | |
| 6.5 | **People** tab | A, B, C, D listed with email, company, role, contacts, shared, last active; A marked "· Super Admin" | ☐ | |
| 6.6 | Search "staff" in People | Only C is shown | ☐ | |
| 6.7 | Anywhere in the Super Admin pages | **No** contact names, phone numbers, notes or follow-ups of other users — **numbers only** | ☐ | |
| 6.8 | A's own **Contacts** tab | Only A's own contacts | ☐ | |
| 6.9 | Phone app as A → Settings | "Pockit owner → Super Admin dashboard" row; opens the same dashboard | ☐ | |

---

## 7. Security checks in the database (optional, strongest proof)

These pretend to be a user inside the Supabase SQL Editor, so you can see exactly what the database allows. They change nothing (`rollback`).

**7.0 — get the user IDs**
```sql
select id, email from auth.users order by created_at;
```

**7.1 — Company Admin B sees: own contacts + C's SHARED contacts only**
```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'B-USER-ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select person_name, user_id, shared_with_org from public.contacts where deleted_at is null;
rollback;
```
Expected: B's contacts, plus C's Contact-1 and Contact-3 — **not** Contact-2. ☐

**7.2 — Member C sees only their own contacts (nothing from B)**
Same query with `C-USER-ID`. Expected: only C's 3 contacts. ☐

**7.3 — Personal user D sees only their own** — same with `D-USER-ID`. ☐

**7.4 — Notes stay private: B cannot read C's notes**
```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'B-USER-ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.interactions where user_id = 'C-USER-ID';
rollback;
```
Expected: **0**. ☐

**7.5 — Only a Super Admin can open the dashboard data**
```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'B-USER-ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select * from public.admin_overview();
rollback;
```
Expected: error **"Super admin only."** Repeat with `A-USER-ID` → one row of numbers. ☐

**7.6 — Nobody can make themselves Super Admin**
```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'C-USER-ID', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.platform_admins (user_id) values ('C-USER-ID');
rollback;
```
Expected: **permission denied** / row-level security error. ☐

**7.7 — Signed-out visitors see nothing**
```sql
begin;
set local role anon;
select count(*) from public.contacts;
rollback;
```
Expected: **permission denied**. ☐

---

## 8. Leaving and clean-up

| # | Step | Expected | ✓ | Notes |
|---|---|---|---|---|
| 8.1 | As **C** → Company → **Leave company** | Join screen again; "0 contacts shared"; C's contacts all private | ☐ | |
| 8.2 | As **B** → Company → Team | C no longer listed | ☐ | |
| 8.3 | As **B** (only person left) → **Leave company** | Test Co disappears from Super Admin → Companies (it is deleted when empty) | ☐ | |
| 8.4 | (Optional) Delete test accounts B, C, D: each → Settings → **Delete Account** | Super Admin → People shows only A | ☐ | |

---

## Results

| Section | Passed | Failed | Notes |
|---|---|---|---|
| 1 · Everyone | | | |
| 2 · Personal | | | |
| 3 · Company Admin | | | |
| 4 · Member | | | |
| 5 · Admin ↔ Team | | | |
| 6 · Super Admin | | | |
| 7 · Database security | | | |
| 8 · Leaving | | | |

When something fails, note the test number and take a screenshot (and for website errors press **F12 → Console**).
