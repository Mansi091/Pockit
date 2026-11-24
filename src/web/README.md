# src/web — website-only code

Everything in this folder exists only for the website (pockit on Vercel).
The Android app never uses it, apart from two tiny helpers that the shared
screens call and that do nothing on a phone (`hooks/useWebLayout` returns
"not wide" and `lib/webAlert` only installs itself on web).

| Folder | What it is |
|---|---|
| `components/` | Web-only UI: `WebSidebar` (left menu), `WebCardScanner` (webcam + corner crop), `WebDialogHost` (styled pop-ups instead of browser alerts) |
| `scanner/` | Webcam bridge, OpenCV card detection (runs in a Web Worker), perspective crop maths |
| `hooks/`, `lib/` | Wide-screen layout helper, web alert replacement |
| `overrides/` | **Web versions of shared files.** Same path as in `src/`; the web build uses these instead |

## How `overrides/` works

`metro.config.js` checks every import in the **web** bundle: if
`src/web/overrides/<same path>` exists, that file is used instead of `src/<path>`.

| Shared file (Android) | Web override |
|---|---|
| `services/ocrService.ts` (ML Kit on the phone) | `overrides/services/ocrService.ts` (Gemini via the `scan-card` Edge Function) |
| `services/cameraService.ts` (phone camera / document scanner) | `overrides/services/cameraService.ts` (webcam scanner / file upload) |
| `services/imageService.ts` (files on the phone) | `overrides/services/imageService.ts` (data URLs in the browser) |
| `sync/supabaseRemoteStore.ts` | `overrides/sync/supabaseRemoteStore.ts` (photo upload from the browser) |
| `lib/secureStorage.ts` (Android Keystore) | `overrides/lib/secureStorage.ts` (browser storage) |
| `components/DateTimeField.tsx` (native picker) | `overrides/components/DateTimeField.tsx` (HTML date/time inputs) |

Rules:
- An override must export the same names and types as the shared file.
- Never import an override directly from shared code; import the shared path
  and let the web build swap it.
- Do not add `*.web.ts` files elsewhere in `src/`; put them here.
- Typecheck and Jest use the shared (Android) files.
