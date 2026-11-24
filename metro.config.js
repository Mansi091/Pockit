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

function webOverrideFor(filePath) {
  if (!filePath.startsWith(SRC + path.sep) || filePath.startsWith(WEB_DIR + path.sep)) return null;
  if (!overrideCache.has(filePath)) {
    const candidate = path.join(OVERRIDES, path.relative(SRC, filePath));
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
