# PRODUCTION DB / DATABASE_URL BAĞLANTI RAPORU

Tarih: 2026-06-29
Not: Bu rapor **secret değer içermez**. Gerçek `DATABASE_URL` Vercel ortam değişkenidir ve burada gösterilmez. Maskeli doğrulama için aşağıdaki admin-only tanılama ucu kullanılır.

## 1. Kod tarafı bağlantı yapılandırması (`api/_lib/sql.js`)

| Ayar | Değer | Açıklama |
|---|---|---|
| `ssl` | `'require'` | TLS zorunlu |
| `max` (genel) | 1 | |
| `max` (pooler) | 3 | Eşzamanlı isteklerin tek bağlantıda sıraya girmemesi için |
| `idle_timeout` | 20sn | |
| `connect_timeout` | 10sn | Bağlantı kurulumu üst sınırı |
| `max_lifetime` | 60sn | |
| `prepare` (pooler) | `false` | PgBouncer transaction mode uyumu |
| `fetch_types` (pooler) | `false` | |
| `application_name` | `liberte-club` | |

- **Pooler tespiti:** `:6543` portu **veya** `pooler.supabase.com` host'u → transaction pooler kabul edilir, prepared statement kapatılır (`postgres.js` için doğru).
- **Neon koruması:** `assertProductionDatabaseAllowed` — production'da `provider === 'neon'` ise bağlantı **reddedilir** ve `[db.connection] BLOCKED` loglanır.
- **Bayat bağlantı:** Paylaşılan istemci instance ömrü boyunca yeniden kullanılır; `resetSqlClient` referansı düşürür (in-flight sorguları koparmaz). `primeSqlConnection` login öncesi 2.5sn'lik `SELECT 1` ile yoklar.

## 2. Maskeli doğrulama — admin-only tanılama (YENİ ENDPOINT GEREKMEZ)

Mevcut uç: `GET /api/config?resource=db-status`
Erişim: admin oturumu **veya** `CONFIG_DIAG_SECRET` (production'da zorunlu, `requireConfigDiagAccess`).

Dönen alanlar (secret/PII içermez):

```
{
  "provider": "supabase" | "neon" | "unknown",
  "hostMasked": "aws-0-***.pooler.supabase.com",   // ilk segment + son 2 segment
  "port": 6543,
  "ssl": true,
  "pooler": true,
  "transactionPooler": true,
  "pingOk": true|false,        // SELECT 1 canlı mı
  "publicTableCount": <int>,   // public şemadaki BASE TABLE sayısı
  "neonBlocked": false,
  "recommendation": null | "..."
}
```

### Beklenen sağlıklı değerler
- `provider`: `supabase`
- `pooler`: `true`, `transactionPooler`: `true`, `port`: `6543`
- `ssl`: `true`
- `pingOk`: `true`
- `publicTableCount`: > 0 (sıfır veya düşükse migration eksik)
- `neonBlocked`: `false`

### Kırmızı bayraklar
| Belirti | Anlam | Aksiyon |
|---|---|---|
| `provider: "neon"` | Production'da Neon URL kalmış | Vercel `DATABASE_URL`'i Supabase pooler `:6543` yap |
| `pingOk: false` | DB'ye `SELECT 1` gitmiyor | Supabase projesi duraklatılmış/erişilemez mi kontrol et |
| `transactionPooler: false` ama supabase | Direct/session pooler kullanılıyor | `:6543` transaction pooler öner |
| `publicTableCount` çok düşük | Migration eksik | `PRODUCTION_DB_CHECK.sql` çalıştır |

## 3. DATABASE_URL kontrol listesi (Vercel Dashboard)

1. **Provider:** Host `*.pooler.supabase.com` mı? (Neon `*.neon.tech` OLMAMALI.)
2. **Port:** `6543` (transaction pooler) — Vercel serverless için doğru seçim.
3. **SSL:** `?sslmode=require` veya kod `ssl: 'require'` zorluyor (zaten var).
4. **Kullanıcı:** Supabase pooler kullanıcı formatı `postgres.<project-ref>`.
5. **Eski Neon:** Preview/Production ortamlarında eski Neon URL kalmadığından emin ol.
6. **Connection timeout:** `connect_timeout: 10` kodda var.
7. **Max connections:** pooler için `max: 3`. Serverless'te lambda başına düşük tutulmalı — pooler bağlantı limitini aşmamak için uygun.

## 4. Mevcut belirtilerle korelasyon

Tüm endpoint'lerin ~6sn transient 503 / 16–22sn 500 vermesi `pingOk: false` (veya çok yavaş ping) ile uyumludur. Yani DB **erişilemez veya pooler bağlantısı yanıt vermiyor**. Önce `db-status` ile `pingOk` ve `provider` doğrulanmalı, sonra `PRODUCTION_DB_CHECK.sql` ile tablo varlığı.

## 5. Sonuç

Kod tarafı bağlantı yapılandırması doğru (SSL require, pooler-aware, Neon-blok, fail-fast). Birincil şüphe **DATABASE_URL'in işaret ettiği DB'nin erişilebilirliği/doğruluğu**. Maskeli doğrulama için yeni endpoint açmaya gerek yok — `db-status` yeterli.
