# Pockit UI Redesign Handoff

Last updated: 2026-11-22

## Purpose

This document records the UI redesign and bug-fix work completed so another agent can continue the project without repeating completed work or inventing requirements.

The project root is:

`D:\CARD-PROJECT\SmartCardManager`

This handoff supplements `docs/PROJECT_HANDOFF.md`, which contains the original architecture and project status.

## Project state

- Expo React Native TypeScript project
- Existing navigation, SQLite, Supabase sync, OCR, categories and planner behavior remain in place
- Figma Make redesign: https://www.figma.com/make/T0wgfnUHxNKinn3WueKfDy/POCKIT-Complete-UI-UX-Redesign
- Figma generated prototype source was captured for visual reference
- The prototype is React web code; it must be translated to React Native. It cannot be copied directly into this project.

## Completed work

### 1. Phone country detection

Updated `src/utils/phone.ts` and the draft flow so country codes are detected automatically instead of defaulting every number to India.

Supported cases include:

- Explicit international codes such as `+91`, `+82`, `+1` and `0091`
- Indian 10-digit mobile numbers
- South Korean `010` and geographic/area-code numbers
- US/Canada-style `(415) 555-0142` formatting
- Ambiguous numbers remain unconfirmed rather than silently assigned to India

Also removed the India default from new empty phone rows in:

- `src/app/review-contact.tsx`
- `src/components/PhoneListEditor.tsx`

Relevant tests:

- `src/utils/__tests__/phone.test.ts`
- `src/utils/__tests__/phoneDrafts.test.ts`
- `src/database/__tests__/migrationV2.test.ts`

### 2. OCR review cleanup

Removed the normal user-facing raw OCR controls from:

- `src/app/processing.tsx`
- `src/app/review-contact.tsx`

Raw OCR data is still stored internally in the contact data and SQLite data model for debugging and future processing improvements.

The processing result now uses simple user-facing copy instead of technical line/field counts:

- "Card scanned successfully. Check the detected details before saving."

### 3. Generic name extraction improvement

Improved `src/services/extractionService.ts` without language-specific hardcoding.

Changes include:

- Generic layout and text-size evidence
- Better email/local-part agreement with candidate names
- Better separation of names from company names and designation text
- Support for strong single-word name candidates
- Low-confidence warnings remain for uncertain extraction

Relevant tests:

- `src/services/__tests__/extractionService.test.ts`
- `src/services/__tests__/ocrMisreads.test.ts`
- `src/services/__tests__/cardMerge.test.ts`

No ML model or cloud OCR was added.

### 4. Custom category colours

Updated `src/components/CategoryEditor.tsx` and `src/services/categoryService.ts`.

Users can now:

- Choose a preset category colour
- Enter a custom six-digit hex colour
- Preview the category colour before saving
- Edit the colour of an existing category

The category system already supports creating, renaming, editing and deleting categories.

Relevant test:

- `src/utils/__tests__/categoryLayout.test.ts`

### 5. Figma-inspired visual redesign

Captured the Figma React prototype and CSS for reference.

The captured design reference shows:

- 34 complete mobile screens and states
- Home
- Contacts
- Contact details
- Contact notes
- Contact follow-ups
- Scan and card review flows
- Planner
- Calendar
- Events
- Category bubbles
- Category connections
- Category list
- Category creation
- Settings
- Authentication
- Empty and recovery states

The implementation is React Native, not the Figma React web prototype. The visual language has been translated into the existing app rather than copied as web-only markup or CSS.

### 6. Theme and shared components

Updated `src/constants/theme.ts` to use the Figma-inspired neutral light palette:

- Warm white/light-grey backgrounds
- Near-black text
- Charcoal primary actions
- Restrained borders
- Category colours remain custom and separate
- Softer rounded cards and shadows

Installed and loaded Manrope fonts:

- `@expo-google-fonts/manrope`
- `expo-font`
- Four weights loaded in `src/app/_layout.tsx`

Updated shared components and navigation:

- `src/components/CustomButton.tsx`
- `src/app/(tabs)/_layout.tsx`

The bottom bar retains the existing architecture:

- Home
- Contacts
- Scan
- Planner
- Categories

### 7. Screen updates

Applied the first redesign pass to existing live screens:

- `src/app/(tabs)/index.tsx` — Home
- `src/app/(tabs)/contacts.tsx` — Contacts
- `src/app/(tabs)/planner.tsx` — Planner
- `src/app/(tabs)/categories.tsx` — Categories
- `src/app/contact/[id].tsx` — Contact profile
- `src/app/settings.tsx` — Settings
- `src/app/scan.tsx` — Scan entry and copy
- `src/app/review-contact.tsx` — Raw OCR removed
- `src/app/processing.tsx` — Processing copy cleaned

Existing behavior is preserved; these changes are visual where possible.

## Validation completed

The following checks pass:

```powershell
npm run typecheck
npm test -- --runInBand
```

At the latest complete run:

- 14 Jest suites pass
- 107 Jest tests pass

No native dependency change was made by the redesign work.

Manrope and font dependencies are JavaScript/package changes. A native rebuild may be required only according to the normal Expo dependency workflow if the package cannot be used in the existing build.

## Modified files

Main redesign and fix files:

- `package.json`
- `package-lock.json`
- `src/constants/theme.ts`
- `src/app/_layout.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/contacts.tsx`
- `src/app/(tabs)/planner.tsx`
- `src/app/(tabs)/categories.tsx`
- `src/app/contact/[id].tsx`
- `src/app/settings.tsx`
- `src/app/scan.tsx`
- `src/app/processing.tsx`
- `src/app/review-contact.tsx`
- `src/components/CustomButton.tsx`
- `src/components/CategoryEditor.tsx`
- `src/components/PhoneListEditor.tsx`
- `src/services/categoryService.ts`
- `src/services/extractionService.ts`
- `src/utils/phone.ts`

Tests updated or expanded:

- `src/utils/__tests__/phone.test.ts`
- `src/utils/__tests__/phoneDrafts.test.ts`
- `src/services/__tests__/extractionService.test.ts`
- `src/database/__tests__/migrationV2.test.ts`
- `src/utils/__tests__/categoryLayout.test.ts`

## Important remaining work

The redesign is not complete merely because it passed tests. Device and visual verification remains necessary.

### 1. Complete the Figma screen conversion

The existing screens need final visual matching against the captured Figma design:

- Review contact
- Processing and card preview
- Batch review
- Contact notes and follow-ups
- Planner follow-ups
- Calendar
- Events
- Event details
- Create event
- New follow-up
- Add meeting note
- Category bubbles
- Category connections
- Category list
- Settings sub-screens
- Auth screens
- Empty, loading and recovery states

Do not replace live behavior with the prototype's sample-data interactions. Preserve SQLite/Supabase logic.

### 2. Match visual details carefully

Remaining visual QA should cover:

- Safe areas
- Small Android devices
- iPhone sizes
- Scroll content
- Keyboard behaviour
- Bottom-navigation height
- Form spacing
- Text wrapping
- Category bubble sizing
- Empty/loading/error states
- Press states
- Modal and sheet heights

### 3. Remove or update remaining indigo UI remnants

Search the project for old indigo/blue primary usages and replace them only where they conflict with the Figma neutral/charcoal design:

```powershell
rg "#4F46E5|#4338CA|#EEF2FF|primarySoft|colors.primary"
```

Category colours are intentionally allowed to remain separate.

### 4. Verify OCR and country detection on real cards

Device testing is still required for:

- Korean and English card text
- Multiple phone formats
- Unknown-country numbers
- Front/back merge behavior
- Name/company extraction
- Multi-card batch scanning

### 5. Run Expo checks

Before release:

```powershell
npm run typecheck
npm test -- --runInBand
npx expo-doctor
npx expo export --platform android
```

Do not claim a native or device feature works until verified on a real device.

## Rules for the next agent

Follow `docs/PROJECT_HANDOFF.md` and these rules:

1. Preserve existing navigation and functionality.
2. Do not invent APIs or SDK behavior.
3. Verify installed package typings before native API changes.
4. Keep OCR and processing on-device.
5. Keep SQLite as the source of truth.
6. Do not silently default ambiguous phone countries to India.
7. Do not hardcode one language or nationality as a general extraction rule.
8. Do not reintroduce raw OCR text in normal user-facing screens.
9. Keep loading, empty and error states on every screen.
10. No UI changes should bypass Supabase RLS or expose secrets.

## Recommended next step

Continue with one focused Figma conversion batch at a time:

1. Review Contact
2. Processing and card preview
3. Contact notes/follow-ups
4. Categories
5. Planner
6. Settings
7. Authentication
8. Remaining empty/error/recovery states

After each batch, run TypeScript, Jest and Expo Doctor, then test the affected screen on a physical Android phone.
