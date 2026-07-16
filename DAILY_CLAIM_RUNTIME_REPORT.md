# /api/loyalty/daily-claim RUNTIME RAPORU

Tarih: 2026-06-29
Sorun: daily LP claim 503 dönüyor (~6.2–6.5sn).

## Hata ayrım ağacı (yeni davranış)

| Durum | HTTP | Kod | Guardian |
|---|---|---|---|
| Oturum yok / geçersiz | 401 | — | yok (hızlı, `requireSession`) |
| `daily_claims` tablosu eksik | 503 | `DAILY_CLAIMS_TABLE_MISSING` | incident (migration-required) |
| DB geçici sorun (bağlantı/timeout) | 503 | `DAILY_CLAIM_TEMPORARILY_UNAVAILABLE` | degraded incident |
| Zaten claim alınmış | 400 | iş kuralı | yok |
| Başarılı | 200 | `ok:true`, `loyalty`, `dailyClaims` | yok |
| Diğer | 500 | `DAILY_CLAIM_FAILED` | logServerError |

## Gözlemlenen 503'ün yorumu

Bu deploy'dan ÖNCE handler **503'ü yalnızca** `DAILY_CLAIMS_TABLE_MISSING` için dönüyordu. Yani gözlenen 503'ler iki olasılıktan biri:

1. **`daily_claims` tablosu/sütunu üretimde gerçekten eksik** (migration uygulanmamış). ~6sn süre, bayat bağlantının önce kurulup sonra "relation does not exist" dönmesiyle açıklanır.
2. Tüm DB katmanı aynı anda transient (state 500, admin 503) olduğundan, bu büyük olasılıkla **bağlantı katmanı sorunudur**; tablo gerçekten varsa bu deploy sonrası kod artık bunu `DAILY_CLAIM_TEMPORARILY_UNAVAILABLE` (transient) olarak ayıracak.

**Kesin ayrım:** `PRODUCTION_DB_CHECK.sql` çalıştırıldığında `to_regclass('public.daily_claims')`:
- `NULL` → tablo eksik, migration uygula (`001` + `005`).
- dolu → sorun bağlantı/pooler; bkz. `PRODUCTION_DB_CONNECTION_REPORT.md`.

## Düzeltme (kod)

- `customerLoyaltyClaim.js`: `isTransientDbError` dalı eklendi → transient 503 `DAILY_CLAIM_TEMPORARILY_UNAVAILABLE` + `reportDailyClaimTransient()` (degraded incident). Tablo-eksik kontrolü transient kontrolünden ÖNCE (spesifik önce).
- Auth zaten en başta (`requireSession`) → oturum yoksa DB'ye gitmeden 401.

## Kabul testleri

- `daily-claim: transient -> 503 DAILY_CLAIM_TEMPORARILY_UNAVAILABLE (tablo eksikten ayrı)` ✅
- `daily-claim: auth requireSession ile (oturum yoksa hızlı 401)` ✅
