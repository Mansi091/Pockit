// Metro bundler config — extends Expo's defaults.
// Web only needs these two additions (Android/iOS are unaffected):
//  1. `.wasm` as an asset, so expo-sqlite's in-browser SQLite (wa-sqlite) can load.
//  2. Cross-origin isolation headers on the dev server. expo-sqlite on web runs
//     in a worker that needs SharedArrayBuffer, which browsers only enable on
//     cross-origin-isolated pages. `credentialless` (not `require-corp`) keeps
//     cross-origin images such as Supabase signed URLs loading.
//     Production hosting must send the same headers (see vercel.json).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
