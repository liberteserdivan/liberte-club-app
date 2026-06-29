# /api/state HOTFIX RAPORU

Tarih: 2026-06-29
Sorun: `/api/state` 500 dönüyor ve 16–22 saniye sürüyor.

## İncelenen yollar

- `api/state.js` (GET/POST handler, `withSqlRequest` sarmalı)
- `loadAppState`, `loadAppStateForCustomer`, `loadAppStateRevision` (`api/_lib/appState.js`)
- `runSql` / `runSqlRead` / `runSqlReadFast` (`api/_lib/runSql.js`)
- auth: `getSessionForBootstrap`, `requireSession` (`api/_lib/auth.js`)

## Kök neden

- GET okumaları `runSqlRead` kullanıyordu: bayat bağlantıda 6sn × 2–4 retry → 16–22sn bekleme, sonra ham **500**.
- Geçici DB sorunu ile kalıcı sunucu hatası ayırt edilmiyordu → transient durumda da 500.

## Düzeltme

| Hedef | Durum |
|---|---|
| Read işlemleri fail-fast | ✅ Tüm okuma uçları `runSqlReadFast` (3sn × 1–2 deneme) |
| Auth yoksa hızlı 401 | ✅ `getSessionForBootstrap` null → DB state okumasından **önce** 401 |
| Transient → 503 | ✅ `isTransientDbError` → 503 `STATE_TEMPORARILY_UNAVAILABLE` |
| Ham DB error 500 sızmaz | ✅ transient ayrımı + `publicDbErrorMessage`/`publicDbErrorCode` |
| 20sn bekleme yok | ✅ fail-fast okuma ile üst sınır ~6sn |
| Customer minimal state | ✅ `isFullAdmin ? loadAppState() : loadAppStateForCustomer()` (customer admin verisi yüklemez) |
| Login/logout bozulmaz | ✅ 503 istemcide network hatası gibi ele alınır; logout/login döngüsü tetiklemez |

## Kabul testleri (kaynak + davranış)

- `state: okuma işlemleri runSqlReadFast kullanır (raw/yavaş path yok)` ✅
- `state: geçici DB sorunu 503 STATE_TEMPORARILY_UNAVAILABLE döner` ✅
- `state: auth yoksa DB state okuması yapmadan 401 döner` ✅
- `state: customer yolu admin tam state değil, customer slice yükler` ✅

## Notlar

- POST yazma yolu hâlâ `runSql` (idempotent olmayan tam state yazımı yarışmaya sokulmaz); ancak yazma sonrası revision okuması `runSqlReadFast`.
- Shared catch bloğu transient'i hem GET hem POST için 503'e çevirir → 500 sızması engellenir.
