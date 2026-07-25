# Liberte Club — Veritabanı Teknik Dokümantasyonu

Bu belge, **Liberte Gastro Cafe sadakat uygulamasının** veri katmanını açıklar. Bağlantı bilgileri, şifreler ve production ortam değişkeni değerleri **bilinçli olarak** bu dosyada yer almaz.

---

## Özet

| Özellik | Değer |
|---------|--------|
| Veritabanı | **PostgreSQL** (production: **Supabase**; transaction pooler `:6543`) |
| Node sürücüsü | `postgres` (postgres.js). `@neondatabase/serverless` bağımlılıkta kalabilir; **production Neon engellidir** (`api/_lib/sql.js`) |
| Bağlantı | Vercel ortam değişkeni `DATABASE_URL` (secret değerleri bu dosyada yok) |
| Havuz | Serverless instance başına `max: 1`, `prepare: false` (pooler), `statement_timeout` ~25s |
| API katmanı | Vercel Serverless Functions (`/api/*`) |
| Ana veri modeli | Hibrit: normalize tablolar (`USE_RELATIONAL_STATE=1`) + `app_state` JSONB dilimleri |
| İstemci önbelleği | `localStorage` (`liberteDB`) |

Production istemci girişi Vite **v1** (`src/`), bkz. `src/LEGACY.md`. Kimlik doğrulama, PIN, oturum ve e-posta arama güvenlik kritik alanlarda ayrı SQL tablolarındadır.

---

## Mimari diyagram

```
┌─────────────────────────────────────────────────────────────┐
│  İstemci (Web / PWA / Capacitor Android-iOS)                │
│  React + localStorage önbellek                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           │ GET/POST /api/state
                           │ /api/auth/*, /api/account/*
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel Serverless API (Node.js)                            │
│  api/_lib/appState.js, auth.js, pinAuth.js, stateAccess.js │
└──────────────────────────┬──────────────────────────────────┘
                           │ postgres.js (Supabase pooler)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                        │
│  app_state · customers · customer_loyalty · auth_sessions   │
└─────────────────────────────────────────────────────────────┘
```

---

## PostgreSQL tabloları

Tablolar geliştirmede lazy ensure veya `scripts/sql/*` bootstrap ile oluşur. Production'da DDL genelde bootstrap migration ile gelir (`api/_lib/schemaReady.js` production DDL atlar).

### 1. `app_state` — ana uygulama durumu

Tüm iş verisinin merkezi deposu.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | `text` PK | Sabit: `liberte` |
| `data` | `jsonb` | Uygulama durumu (müşteriler, sadakat, menü vb.) |
| `updated_at` | `timestamptz` | Son güncelleme zamanı |

**Okuma:** `loadAppState()` — `api/_lib/appState.js`  
**Yazma:** `saveAppState(data)` / `saveAppStateIfUnchanged(data, expectedUpdatedAt)` — kasa işlemlerinde optimistic lock

### 2. `app_state_backups` — otomatik yedekler

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | `bigserial` PK | Yedek kimliği |
| `data` | `jsonb` | O anki tam `app_state` kopyası |
| `reason` | `text` | `auto` veya `pre-delete` |
| `customer_count` | `int` | Yedek anındaki üye sayısı |
| `created_at` | `timestamptz` | Oluşturulma zamanı |

**Politika:**

- Üye sayısı azalırsa (`pre-delete`) her zaman yedeklenir.
- Periyodik yedek: en az **30 dakika** arayla (`BACKUP_THROTTLE_MS`).
- `auto` yedeklerden en fazla **100** adet tutulur; `pre-delete` yedekleri budanmaz.
- Yönetici geri yükleme: `GET/POST /api/backup` (PIN doğrulanmış admin).

### 3. `auth_sessions` — oturumlar

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | `uuid` PK | Oturum kaydı |
| `token_hash` | `text` UNIQUE | SHA-256 hash (düz token saklanmaz) |
| `customer_id` | `bigint` | Müşteri kimliği |
| `role` | `text` | `user` veya `admin` |
| `admin_verified` | `boolean` | Yönetici kasa PIN onayı |
| `device_id` | `text` | İsteğe bağlı cihaz kimliği |
| `expires_at` | `timestamptz` | Oturum bitişi (30 gün) |
| `created_at` | `timestamptz` | Oluşturulma |

**Token iletimi:**

- Web: HttpOnly cookie `liberte_session`
- Native (Capacitor): `Authorization: Bearer <token>` + `sessionStorage`

Modül: `api/_lib/auth.js`

### 4. `customer_pin_auth` — müşteri PIN kimlik doğrulama

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `phone` | `text` PK | Normalize telefon (10 hane) |
| `customer_id` | `bigint` | Bağlı müşteri |
| `pin_hash` | `text` | PBKDF2-SHA512 hash |
| `pin_salt` | `text` | Tuz |
| `failed_attempts` | `int` | Hatalı deneme sayısı |
| `locked_until` | `timestamptz` | Kilit bitişi |
| `updated_at` | `timestamptz` | Son güncelleme |

**Güvenlik:**

- PIN düz metin **asla** saklanmaz.
- PBKDF2: 120.000 iterasyon, SHA-512.
- 5 hatalı deneme → 10 dakika kilit.

Modül: `api/_lib/pinAuth.js`

### 5. `email_codes` — e-posta OTP

Kayıt ve PIN sıfırlama için 6 haneli doğrulama kodları.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | `bigserial` PK | |
| `email` | `text` | Hedef e-posta |
| `phone` | `text` | İlişkili telefon |
| `code` | `text` | OTP |
| `code2` | `text` | Ek alan (eski uyumluluk) |
| `attempts` | `int` | Deneme sayısı |
| `used` | `boolean` | Kullanıldı mı |
| `purpose` | `text` | `register`, `forgot-pin` vb. |
| `expires_at` | `timestamptz` | Geçerlilik süresi |
| `created_at` | `timestamptz` | |

Modül: `api/_lib/emailCodesSchema.js`, `api/_lib/emailCodes.js`  
E-posta gönderimi: Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`)

### 6. `customer_emails` — e-posta arama indeksi

JSON içinde müşteri aramayı hızlandırmak ve e-posta benzersizliğini desteklemek için.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `email` | `text` PK | Normalize e-posta |
| `customer_id` | `bigint` | Müşteri kimliği |
| `phone` | `text` | Telefon |
| `updated_at` | `timestamptz` | |

Modül: `api/_lib/customerEmails.js`

---

## JSONB iç modeli (`app_state.data`)

Tek kayıt altında tutulan ana koleksiyonlar (`src/lib/db.js` — `seed` ve `mergeDb`):

| Alan | Açıklama |
|------|----------|
| `settings` | Kafe adı, tema renkleri, logo, damga eşiği, promosyon metinleri |
| `customers[]` | Üye profilleri (ad, telefon, e-posta, doğum tarihi, davet kodu, `isAdmin`) |
| `loyalty{}` | Müşteri ID → sadakat kartı (damgalar, ikram hakları, seviye) |
| `categories[]`, `items[]` | Menü kategorileri ve ürünler |
| `menuRevision` | Menü seed sürümü |
| `campaigns[]` | Uygulama içi kampanyalar |
| `dailyCampaign` | Günün kampanyası |
| `wheelPrizes[]` | Şans çarkı ödülleri |
| `coupons[]`, `couponUses[]` | Kupon tanımları ve kullanımları |
| `notifications[]` | Uygulama içi bildirim geçmişi |
| `pushSubscriptions[]` | FCM web push token kayıtları |
| `pushLog[]` | Push gönderim logu |
| `history[]` | Damga / ikram / işlem geçmişi |
| `feedback[]` | Geri bildirimler |
| `referrals[]` | Davet ilişkileri |
| `checkIns[]`, `dailyClaims[]`, `wheelSpins[]` | Etkileşim kayıtları |
| `customerNotes{}` | Yönetici notları (müşteri ID → metin) |
| `googleReviewRequests[]` | Google yorum bonus talepleri |

**Sadakat kategorileri:** kahve, tatlı, burger (`src/lib/loyaltyStamps.js`).

---

## Normalize PostgreSQL hedef mimarisi (hazırlık — cutover yapılmadı)

Production hâlâ **`app_state.data` JSONB** üzerinden okur/yazar. Normalize tablolar yalnızca migration hazırlığı içindir.

| JSONB alanı | Hedef tablo |
|-------------|-------------|
| `customers[]` | `customers` |
| `loyalty{}` | `customer_loyalty` + `entity_revisions` |
| `history[]` | `loyalty_events` |
| `categories[]` | `menu_categories` |
| `items[]` | `menu_items` |
| `campaigns[]` | `campaigns` |
| `dailyCampaign` | `daily_campaigns` |
| `coupons[]` | `coupons` |
| `couponUses[]` | `coupon_uses` |
| `checkIns[]` | `check_ins` |
| `wheelPrizes[]` | `wheel_prizes` |
| `wheelSpins[]` | `wheel_spins` |
| `dailyClaims[]` | `daily_claims` |
| `firstOrderBonuses[]` | `first_order_bonuses` |
| `referrals[]` | `referrals` |
| `feedback[]` | `feedback` |
| `googleReviewRequests[]` | `google_review_requests` |
| `customerNotes{}` | `customer_notes` |
| `notifications[]` | `in_app_notifications` |
| `pushSubscriptions[]` | `push_subscriptions` |
| `pushLog[]` | `push_send_log` |

**Kural:** `app_state.data` silinmez; legacy/backup olarak kalır.

### Feature flag (öneri)

| Değişken | Değer | Davranış |
|----------|-------|----------|
| `USE_RELATIONAL_STATE` | `false` (varsayılan) | Mevcut JSONB yolu |
| `USE_RELATIONAL_STATE` | `true` | Normalize tablolardan okuma/yazma (cutover sonrası) |

### Migration çalıştırma (staging / Neon branch)

```bash
# Önce dry-run — yalnızca sayım ve checksum
DATABASE_URL=... node scripts/migrate-jsonb-to-relational.mjs --dry-run

# Şema + veri taşıma (app_state.data dokunulmaz)
DATABASE_URL=... node scripts/migrate-jsonb-to-relational.mjs

# Doğrulama
DATABASE_URL=... node scripts/verify-migration.mjs
```

Şema SQL: `scripts/sql/001_normalized_schema.sql`

### Geri dönüş planı

1. `USE_RELATIONAL_STATE=false` ile API’yi JSONB yoluna al.
2. Normalize tabloları silmek zorunda değilsiniz; `app_state.data` kaynak olarak durur.
3. Sorunlu cutover sonrası: `scripts/restore-state-backup.mjs --latest-pre-delete` veya Neon branch geri yükleme.

---

## API uç noktaları ve veritabanı kullanımı

| Endpoint | Metod | Veritabanı etkisi |
|----------|-------|-------------------|
| `/api/state` | GET | `app_state` okur; oturuma göre filtreler |
| `/api/state` | POST | `app_state` yazar; rol bazlı birleştirme |
| `/api/auth/login` | POST | PIN doğrulama + `auth_sessions` |
| `/api/auth/register-complete` | POST | Müşteri oluşturma + PIN + oturum |
| `/api/auth/forgot-pin` | POST | `email_codes` + PIN güncelleme |
| `/api/auth/admin-pin` | POST | `auth_sessions.admin_verified` |
| `/api/auth/session` | GET/DELETE | Oturum okuma / silme |
| `/api/account/delete` | POST/DELETE | Müşteri + sadakat verisi silme |
| `/api/backup` | GET/POST | Yedek listeleme / geri yükleme |
| `/api/push/send` | POST | FCM (Firebase Admin — DB dışı) |

Durum filtreleme: `api/_lib/stateAccess.js`

- **Müşteri:** Yalnızca kendi profili, sadakat kartı ve ilişkili kayıtlar.
- **Yönetici:** Tam veri (`cashier_pin` istemciye gönderilmez).
- **Yazma koruması:** Müşteri oturumu damga, geçmiş veya admin alanlarını doğrudan yazamaz.

---

## İstemci senkronizasyonu

```
useCommit (src/hooks/useCommit.js)
  ├── commit(n) → localStorage + POST /api/state
  ├── pullRemote() → GET /api/state?since= (60 sn / QR 9 sn)
  └── load() → localStorage birleştirme (mergeDb)
```

| Mod | Davranış |
|-----|----------|
| Production | Bulut (`DATABASE_URL` zorunlu) |
| `useLocalAuth()` (geliştirme) | Yalnızca `localStorage`; sunucu çağrılmaz |
| Arka plan | Polling durur (0 istek) |
| Öne gelince | Tek sync tetiklenir |
| Değişiklik yok | `{ unchanged: true }` — tam JSON gönderilmez |

Native uygulama API kökü: `https://app.libertegastrocafe.com` (`src/lib/apiClient.js`).

---

## Ortam değişkenleri (veritabanı ile ilgili)

| Değişken | Amaç |
|----------|------|
| `DATABASE_URL` | Neon PostgreSQL bağlantı dizesi (**gizli**) |
| `ADMIN_PIN` | Yönetici kasa PIN (sunucu; repoda yok) |
| `RESEND_API_KEY` | OTP e-posta gönderimi |
| `RESEND_FROM_EMAIL` | Gönderen adres |

Firebase push ve config değişkenleri veritabanı dışıdır; ayrı servis olarak çalışır.

---

## Yedekleme stratejisi

1. **Otomatik:** Her `saveAppState` öncesi koşullu yedek (`app_state_backups`).
2. **Yönetici manuel:** `/api/backup` ile JSON indirme veya snapshot geri yükleme.
3. **Neon panel:** Neon projesi üzerinden point-in-time / branch yedekleri (platform özelliği).

---

## İlk kurulum

1. [Neon](https://neon.tech) üzerinde PostgreSQL projesi oluşturun.
2. Bağlantı dizesini Vercel’de `DATABASE_URL` olarak tanımlayın.
3. İsteğe bağlı: `neon.sql` dosyasını Neon SQL Editor’de çalıştırın (tablolar uygulama tarafından da oluşturulur).
4. Vercel deploy sonrası ilk giriş/kayıt `app_state` kaydını oluşturur.

---

## Tasarım notları ve sınırlamalar

**Avantajlar**

- Hızlı geliştirme; tek JSON ile tüm uygulama durumu taşınır.
- Vercel Hobby function limitine uygun az sayıda endpoint.
- Yedekleme ve geri yükleme basit JSON akışı ile yapılır.

**Dikkat edilmesi gerekenler**

- Yüksek eşzamanlı yazımda JSONB genel state için “son yazan kazanır” riski devam eder; kasa LP işlemleri `saveAppStateIfUnchanged` ile korunur.
- Çok büyük `jsonb` boyutu performansı etkileyebilir; binlerce üye sonrası normalizasyon düşünülebilir.
- PIN ve oturum verileri JSON dışında tutulduğu için güvenlik açısından doğru ayrım yapılmıştır.

**Normalize geçiş (hazırlık dosyaları mevcut, production cutover yok)**

- `scripts/sql/001_normalized_schema.sql`
- `scripts/migrate-jsonb-to-relational.mjs` (dry-run destekli)
- `scripts/verify-migration.mjs`

---

## İlgili dosyalar

| Dosya | Rol |
|-------|-----|
| `neon.sql` | Minimal şema referansı |
| `api/_lib/appState.js` | Ana CRUD + yedekleme + optimistic lock |
| `api/_lib/auth.js` | Oturum yönetimi |
| `api/_lib/pinAuth.js` | PIN hash / doğrulama |
| `api/_lib/stateAccess.js` | Rol bazlı okuma/yazma |
| `api/_lib/customerEmails.js` | E-posta indeksi |
| `api/state.js` | `/api/state` handler |
| `scripts/sql/001_normalized_schema.sql` | Normalize hedef şema |
| `scripts/migrate-jsonb-to-relational.mjs` | JSONB → tablo taşıma |
| `scripts/verify-migration.mjs` | Sayım/checksum doğrulama |
| `src/lib/db.js` | İstemci veri modeli ve seed |
| `src/hooks/useCommit.js` | Senkronizasyon hook’u |

---

*Son güncelleme: proje sürümü 1.1.2 — Neon PostgreSQL + JSONB hibrit model; normalize şema hazırlığı eklendi.*
