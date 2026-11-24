// Metro bundler config — extends Expo's defaults.
//
//  1. Web overrides (keeps the website's code out of the app's folders).
//     Everything that exists only for the website lives in `src/web/`.
//     `src/web/overrides/` mirrors `src/`: when the WEB bundle imports a file
//     from `src/` and a file with the same path exists under
//     `src/web/overrides/`, the web build uses that one instead.
//       e.g. src/services/ocrService.ts          → Android (ML Kit, on-device)
//            src/web/overrides/services/ocrService.ts → website (Gemini via Edge Function)
//     Android/iOS builds never look in `src/web/overrides/`.
//  2. `.wasm` as an asset, so expo-sqlite's in-browser SQLite (wa-sqlite) can load.
//  3. Cross-origin isolation headers on the dev server. expo-sqlite on web runs
//     in a worker that needs SharedArrayBuffer, which browsers only enable on
//     cross-origin-isolated pages. `credentialless` (not `require-corp`) keeps
//     cross-origin images such as Supabase signed URLs loading.
//     Production hosting must send the same headers (see vercel.json).
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const SRC = path.join(__dirname, 'src');
const WEB_DIR = path.join(SRC, 'web');
const OVERRIDES = path.join(WEB_DIR, 'overrides');
const overrideCache = new Map();

// Windows paths are case-insensitive and Metro may report the drive as `d:` or `D:`
// depending on where the server was started, so compare normalised paths.
const norm = (p) => {
  const n = path.resolve(p);
  return process.platform === 'win32' ? n.toLowerCase() : n;
};
const SRC_N = norm(SRC) + path.sep;
const WEB_DIR_N = norm(WEB_DIR) + path.sep;

function webOverrideFor(filePath) {
  const f = norm(filePath);
  if (!f.startsWith(SRC_N) || f.startsWith(WEB_DIR_N)) return null;
  if (!overrideCache.has(filePath)) {
    // Build the override path from Metro's own spelling of `src\` (same drive-letter
    // casing as the rest of its file map); only the comparison ignores case.
    const original = path.resolve(filePath);
    const srcAsMetroSpellsIt = original.slice(0, SRC_N.length);
    const candidate = path.join(srcAsMetroSpellsIt, 'web', 'overrides', original.slice(SRC_N.length));
    overrideCache.set(filePath, fs.existsSync(candidate) ? candidate : null);
  }
  return overrideCache.get(filePath);
}

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  if (platform === 'web' && resolved && resolved.type === 'sourceFile') {
    const override = webOverrideFor(resolved.filePath);
    if (override) return { type: 'sourceFile', filePath: override };
  }
  return resolved;
};

config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
