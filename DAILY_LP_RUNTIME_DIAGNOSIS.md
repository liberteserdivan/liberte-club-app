# Günlük LP / Daily Claim Runtime Teşhisi

İncelenen dosyalar: `api/loyalty.js` → `api/_lib/handlers/customerLoyaltyClaim.js`,
`api/_lib/customerRewards.js`, `api/_lib/dailyClaimsStore.js`,
`api/_lib/loyaltyStore.js`, `api/_lib/relationalState.js`,
`src/lib/customerRewardsClient.js`, `src/components/DailyTasksStrip.jsx`,
`scripts/sql/001_normalized_schema.sql`, `scripts/sql/005_daily_claims_dedup.sql`.

## Akış haritası

1. UI: `DailyTasksStrip.handleDailyClaim()` → `claimDailyLoginRewardRemote()`
   → `POST /api/loyalty/daily-claim`.
2. Handler: `requireSession` → `runSql(applyDailyLoginRewardRelational)`.
3. `applyDailyLoginRewardRelational`:
   - `ensureDailyClaimsSchema(sql)` (idempotent `ALTER TABLE daily_claims ...`).
   - `sql.begin` içinde: müşteri satırı `FOR UPDATE`, `insertDailyClaim` (ON CONFLICT
     (customer_id,type,day) DO NOTHING), LP ekleme, seri bonusları.
4. UI başarıda: `commit({skipRemote:true})` ile yerel loyalty + dailyClaims güncellenir,
   buton gizlenir (`hasDailyClaim`).

## Kontrol listesi sonuçları

| Soru | Bulgu |
|---|---|
| Endpoint session istiyor mu? | Evet (`requireSession`). Logout/login sonrası geçerli token ile sorunsuz. |
| Aynı gün ikinci claim? | `(customer_id,type,day)` unique + `ON CONFLICT DO NOTHING` → "bugün zaten aldın" (400). **Doğru.** |
| Farklı müşteri claim? | Müşteri-bazlı `FOR UPDATE` (global blob kilidi yok) → eşzamanlı claim mümkün. **Doğru.** |
| LP eklenir ama UI güncellenmez mi? | UI başarıda `commit` ile yerel loyalty günceller; `skipRemote:true`. **Güncelleniyor.** |
| Loading state temizleniyor mu? | `finally { setClaimLoading(false) }`. **Evet, her durumda.** |
| Safe Mode daily claim'i kapatıyor mu? | Server-side `dailyClaim:'disabled_temporarily'` bilgisi **istemciye header ile taşınmaz**; istemci daily claim'i Safe Mode yüzünden engellemez. Otomatik Safe Mode da yalnızca admin sağlık ucunda tetiklenir. **Engelleme yok.** |

## Kök neden adayı — `daily_claims` tablosu/şeması eksik

`daily_claims` tablosu temel şemada (`001_normalized_schema.sql`) tanımlı ve ek sütunlar
`ensureDailyClaimsSchema` ile garanti ediliyor. Ancak üretim veritabanında migration
**uygulanmamışsa** (tablo yoksa), `ensureDailyClaimsSchema` içindeki
`ALTER TABLE daily_claims ...` Postgres `42P01 (undefined_table)` hatası fırlatır.

**Eski davranış:** Bu hata `withSqlRetry` tarafından geçici sayılmaz → handler `catch`'ine
düşer → `publicDbErrorMessage` ham metni (örn. `relation "daily_claims" does not exist`)
**kullanıcıya** dönebiliyordu ve admin için net bir sinyal yoktu. Soğuk DB durumunda ise
`statement_timeout`/pooler kopması "geçici hata" mesajıyla sonuçlanır (bu zaten doğru).

## Uygulanan küçük düzeltmeler

- `api/_lib/dbTransient.js`: `isUndefinedTableError(error)` eklendi (`42P01` veya
  "relation ... does not exist"). Bu hata **geçici sayılmaz** (retry ile düzelmez).
- `api/_lib/handlers/customerLoyaltyClaim.js`:
  - Tablo eksikse **503** + `code: 'DAILY_CLAIMS_TABLE_MISSING'` + kullanıcıya
    *"Günlük ödül sistemi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."*
    (ham DB metni sızdırılmaz).
  - Aynı durumda Guardian'a **incident** düşülür: *"daily_claims tablosu eksik olabilir"*
    (öneri: `001` + `005` migration'larını uygula — otomatik çalıştırma yok).

## Operasyonel öneri (otomatik uygulanmaz)
Üretimde `daily_claims` eksikse uygulanacak migration'lar:
`scripts/sql/001_normalized_schema.sql` (tablo) ve `scripts/sql/005_daily_claims_dedup.sql`
(type/day sütunları + unique index). Bu hotfix turunda **migration otomasyonu yapılmadı.**
