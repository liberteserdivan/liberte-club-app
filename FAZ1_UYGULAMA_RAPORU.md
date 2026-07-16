# Faz 1 — Release Blocker Kod Duzeltmeleri Uygulama Raporu

Tarih: 2026-06-29
Kapsam: CANLIYA_GECIS_DENETIM_RAPORU.md icindeki Faz 1 (kod) blocker'lari.
Durum: 5/5 blocker icin kod uygulandi. Tum testler + lint + build YESIL.

## Sonuclar
| Komut | Sonuc |
|------|-------|
| npm test | 411 gecti, 0 basarisiz (9 yeni test) |
| npm run lint | 0 hata, 56 onceden var olan uyari (yeni uyari yok) |
| npm run build | Basarili (exit 0), build sonu 411/411 |

Cikti dosyalari: FAZ1_TEST_OUTPUT.txt, FAZ1_LINT_OUTPUT.txt, FAZ1_BUILD_OUTPUT.txt

## Uygulanan duzeltmeler

### RB-8 — daily_claims uretim DDL guard
- `api/_lib/dailyClaimsStore.js`: `ensureDailyClaimsSchema` artik `isProductionRuntime()` ise erken doner (uretimde ALTER/CREATE INDEX calistirmaz). Diger store'larla tutarli.
- BAGIMLILIK: Uretimde sema 008 ELLE uygulanmis olmali (Faz 0 / RB-6). Aksi halde gunluk odul 503 doner.
- Test: tests/daily-claims-schema-guard.test.mjs (2 test).

### RB-7 — Dogum gunu kahvesi dedup (relational)
- `api/_lib/loyaltyStore.js`: `loadBirthdayHistory` eklendi; `applyLoyaltyActionRelational` artik `birthday_coffee` isleminde gecmis dogum gunu olaylarini kilit altinda yukluyor. Boylece "bu yil zaten alindi" kontrolu calisiyor (tekrar ikram engellendi).
- Test: tests/birthday-coffee-dedup.test.mjs (3 test).

### RB-4 — Global statement_timeout
- `api/_lib/sql.js`: baglanti seceneklerine `connection.statement_timeout = 25000ms` eklendi (hem pooler hem normal). Tek bir sorgu fonksiyon maxDuration'ina (60sn) kadar asili kalamaz; transaction disi yazimlar da korunur.

### RB-5 — Register cifte-yazma korumasi
- `api/_lib/handlers/authRegisterComplete.js`: transaction commit'inden sonraki `bumpAppStateRevision` artik try/catch ile best-effort. Boylece dis `withSqlRetry`'i tetikleyip idempotent OLMAYAN referral bonusunu/oturumu tekrarlama riski kapatildi (transaction + referral zaten commit oldu).

### RB-3 — Admin tam-state yazimi N+1 giderme (toplu upsert)
- `api/_lib/customersStore.js`: `upsertCustomerRowsBulk`, `upsertLoyaltyRowsBulk` (tek satirlik fonksiyonlarla ayni cakisma/sutun davranisi; revision artisi korunur).
- `api/_lib/customerEmails.js`: `upsertCustomerEmailRowsBulk`.
- `api/_lib/relationalState.js`: `persistStateToRelational` artik binlerce seri sorgu yerine TEK transaction icinde toplu upsert yapiyor + `SET LOCAL statement_timeout = '20000ms'` (atomik + bounded). Eski N+1 dongusu kaldirildi.
- Test: tests/blocker-fixes-faz1.test.mjs (RB-3/4/5 kaynak-seviye dogrulamalari).

## ONEMLI — RB-3 icin sahneleme (staging) dogrulamasi gerekli
Bu ortamda gercek bir veritabani CALISTIRILAMADIGI icin, toplu upsert'in (postgres.js `sql(rows, ...cols)` + jsonb cast davranisi) gercek Supabase pooler uzerinde davranisi BIRIM TESTLE degil, ancak sahneleme DB'sinde dogrulanabilir. Canliya almadan once:
1. Sahneleme DB'sinde cok uyeli (orn. 500+ musteri) bir app_state ile admin tam-state kaydet (`POST /api/state` admin + PIN).
2. customers / customer_loyalty / customer_emails satirlarinin dogru yazildigini, jsonb alanlarinin (legacy_json, category_stamps) bozulmadigini, `revision`'in arttigini dogrula.
3. Yazim suresinin eski N+1'e kiyasla belirgin dustugunu olc.

## Siradaki adimlar (Faz 2 onerisi)
- Auth: async pbkdf2; rate-limit retry disina + atomik sayac; cafe IP limiti telefon bazli.
- LP: admin manuel LP ucuna runSql + idempotency; gunluk claim revision bump'i runSql disina.
- Kamera: ayni-kategori tekrar damga (qty/seq); kamera izin on-kontrolu (iOS/web).
- DB: appStateCache revision'a bagla; compose round-trip'leri sinirli paralel.
