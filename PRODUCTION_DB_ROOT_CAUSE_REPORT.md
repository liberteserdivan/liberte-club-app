# PRODUCTION DB / STATE KATMANI — KÖK NEDEN RAPORU

Tarih: 2026-06-29
Kapsam: `/api/admin/members` (503), `/api/state` (500), `/api/loyalty/daily-claim` (503) eşzamanlı bozulması.
Kısıt: Yeni özellik yok, mobil build yok, Autopilot/Guardian UI geliştirme yok.

## 1. Gözlemlenen kanıt (DevTools)

| Endpoint | Sonuç | Süre | Trace |
|---|---|---|---|
| GET /api/admin/members | 503 | 6701ms | LBT-2803EB |
| GET /api/admin/members | 503 | 6227ms | LBT-842CFC |
| GET /api/admin/members | 503 | 6224ms | LBT-A63E88 |
| GET /api/admin/members | 503 | 19685ms | LBT-5FF00E |
| GET /api/state | 500 | 22015ms | LBT-8B06D4 |
| GET /api/state | 500 | 16481ms | LBT-A7706E |
| POST /api/loyalty/daily-claim | 503 | 6459ms | LBT-33D910 |
| POST /api/loyalty/daily-claim | 503 | 6241ms | LBT-6A7885 |
| POST /api/loyalty/daily-claim | 503 | 6242ms | LBT-4E839D |

## 2. Teşhis — bu bir endpoint bug'ı değil, DB/bağlantı katmanı sorunudur

Üç bağımsız endpoint **aynı anda** ve **benzer sürelerde** bozuluyor. Ortak nokta hepsinin DB okuması olması.

- **~6sn 503 (admin-members, daily-claim):** Bu, fail-fast okuma (`runSqlReadFast`, 3sn × 2 deneme ≈ 6sn) sonrası **transient** sınıflandırması demektir. Yani sunucu kontrollü davranıyor; alttaki sorun DB bağlantısının yanıt vermemesi (bayat/kopuk pooler bağlantısı veya DB erişilemez).
- **~16–22sn 500 (state):** `/api/state` hâlâ yavaş `runSqlRead` (6sn × 2–4 retry) kullanıyordu → uzun bekleme + ham 500. **Bu turda düzeltildi** (bkz. `STATE_ENDPOINT_HOTFIX_REPORT.md`).
- **19.6sn admin-members:** Birden fazla **ardışık** fail-fast okuma yığılması (admin doğrulama + customers + loyalty), her biri ~6sn. Admin doğrulama okuması da fail-fast'e çevrilerek + client dedup/circuit breaker ile kısaltıldı (bkz. `ADMIN_MEMBERS_RETRY_STORM_REPORT.md`).

**Sonuç:** Birincil kök neden, **production veritabanına erişim katmanının geçici/sürekli yanıt vermemesi**. Endpoint kodları çoğunlukla doğru davranıyordu; bu tur eksik kalan `/api/state` fail-fast'i ve daily-claim transient ayrımı tamamlandı. Asıl müdahale **DB erişilebilirliği / DATABASE_URL doğrulaması** olmalı.

## 3. Acil hedeflere yanıt

1. **Production DB erişilebilir mi?** → 6sn'lik transient 503'ler bağlantının yanıt vermediğini gösteriyor. `PRODUCTION_DB_CHECK.sql` ile doğrulanmalı.
2. **DATABASE_URL doğru Supabase pooler mı?** → Kod Neon'u production'da reddediyor (`assertProductionDatabaseAllowed`). Maskeli doğrulama: `PRODUCTION_DB_CONNECTION_REPORT.md`.
3. **Tablolar/migration var mı?** → `PRODUCTION_DB_CHECK.sql` çalıştırılmalı (NULL dönen tablo = migration eksik).
4. **/api/state raw/yavaş path?** → Evet kullanıyordu; bu turda `runSqlReadFast` + 503'e çevrildi.
5. **Geçici DB sorununda hızlı 503 mü?** → Artık evet: state 503 `STATE_TEMPORARILY_UNAVAILABLE`, daily-claim 503 `DAILY_CLAIM_TEMPORARILY_UNAVAILABLE`, admin-members 503 (mevcut).
6. **daily LP 503 nedeni?** → Bkz. `DAILY_CLAIM_RUNTIME_REPORT.md` (tablo eksik vs transient ayrımı).

## 4. Yapılan kod değişiklikleri (bu tur)

- `api/state.js`: tüm okuma uçları `runSqlReadFast`; transient → 503 `STATE_TEMPORARILY_UNAVAILABLE`; ham DB hatası 500 sızmaz; auth yoksa DB'ye gitmeden 401.
- `api/_lib/handlers/customerLoyaltyClaim.js`: transient → 503 `DAILY_CLAIM_TEMPORARILY_UNAVAILABLE` (tablo eksik 503'ten ayrı) + degraded Guardian incident.
- `api/_lib/auth.js`: admin doğrulama okuması `runSqlReadFast` (admin-members yığılmasını kısar).
- `src/hooks/useAdminMembers.js`: in-flight dedup + circuit breaker (60sn).
- `src/lib/adminMemberClient.js`: client timeout 60sn → 12sn.

## 5. Sonraki manuel adım (kullanıcı)

1. Supabase SQL Editor'da `PRODUCTION_DB_CHECK.sql` çalıştır.
2. NULL dönen tablo varsa ilgili migration'ı uygula (`scripts/sql/001_normalized_schema.sql`, `005_daily_claims_dedup.sql`).
3. Tüm tablolar varsa sorun bağlantı/pooler'dadır → `PRODUCTION_DB_CONNECTION_REPORT.md` adımlarını izle.

## 6. Doğrulama

- `npm test` → 393/393 geçti.
- `npm run build` → başarılı (vite build + test).
- `npm run lint` → 0 hata (56 pre-existing warning).
- `npm audit` → 8 moderate (firebase-admin/google-cloud transitive `uuid`; pre-existing, breaking-change gerektirir, kapsam dışı).
