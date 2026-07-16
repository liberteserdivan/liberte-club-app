# LEGACY / istemci girişi

Bu klasör (`src/`) **production Vite v1 istemcisidir**.

- `vite.config.js` kökte `src/` ile build alır (`base: "./"`).
- `app-v2/` şu an production build yolunda değildir; native crash sonrası acil rollback için saklanan deneysel ağaçtır (bkz. `app-v2/README.md`).
- Store doğrulamasından sonra `app-v2` arşivlenebilir veya silinebilir; v1 `src/` kaldırılmadan önce net go/no-go kararı gerekir.