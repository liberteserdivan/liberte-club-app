# Liberte Club — istemci v2 (Capacitor rewrite)

API/DB ayni kalir. Bundle: `cafe.liberte.app`.

## Mimari
- `pages/` → UI
- `hooks/` → ekran durumu
- `services/` → domain (auth, state, push, qr, admin)
- `lib/` → apiClient, sessionStore, platform

## Build cutover
- `vite.config.js` root: `app-v2` → cikti: `dist`
- Capacitor `webDir`: `dist` (degismedi)
- Eski `src/` referans icin duruyor; store dogrulamasindan sonra arsivlenecek

## Komutlar
- `npm run dev` / `npx vite` — v2 gelistirme
- `npx vite build` — production web asset
- `node --test tests/app-v2-rewrite.test.mjs` — v2 kritik testler