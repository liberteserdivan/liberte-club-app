# Liberte Club — RLS Planı (Mağaza Öncesi)

> **Durum:** SQL hazır, production'a henüz uygulanmadı.  
> **Kural:** Körleme RLS açma yok — faz 1 → smoke → faz 2 → smoke → faz 3 → smoke.

## Mimari Özet

| Katman | DB credential | RLS etkisi |
|--------|---------------|------------|
| Backend API (`api/_lib/sql.js`) | `DATABASE_URL` → postgres rolü | **BYPASSRLS** — API kırılmamalı |
| Frontend Supabase client | `SUPABASE_ANON_KEY` only | RLS policy'lere tabi |
| Realtime subscription | anon + backend `realtimeToken` JWT | Faz 3 policy'leri |

**Service role:** Frontend bundle'da yok. Backend'de de kullanılmıyor (postgres connection).

## Secret Taraması

| Secret | Frontend | Backend env |
|--------|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ yok | ❌ kullanılmıyor |
| `SUPABASE_ANON_KEY` | ✅ (güvenli) | ✅ config endpoint |
| `SUPABASE_JWT_SECRET` | ❌ yok | ⚠️ **Vercel'e eklenmeli** (Realtime RLS) |
| `QR_SIGNING_SECRET` / `ADMIN_PIN` | ❌ yok | ✅ |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ❌ yok | ✅ |

## Frontend Supabase Kullanımı

- **Doğrudan tablo SELECT/INSERT/UPDATE:** YOK
- **Sadece:** `postgres_changes` realtime dinleme (`realtimeManager.js`)
- **Veri kaynağı:** `/api/*` + `/api/realtime` fetch (payload UI'a direkt uygulanmaz)

## Realtime Dinlenen Tablolar

| Tablo | Kanal | Filtre |
|-------|-------|--------|
| `customer_loyalty` | müşteri | `customer_id=eq.{id}` |
| `loyalty_events` | müşteri + admin | müşteri: customer_id; admin: tümü (JWT admin) |
| `in_app_notifications` | müşteri | customer_id veya target_type=all |
| `campaigns` | müşteri | aktif (public read faz 2) |
| `coupons` | müşteri | aktif (public read faz 2) |
| `customers` | admin | INSERT (JWT admin verified) |
| `push_send_log` | admin | JWT admin verified |

**Publication'da olmayan:** `push_subscriptions` (bilinçli — token sızıntı riski)

---

## Tablo Sınıflandırması ve Policy Planı

### A) Backend-only (anon/authenticated direct erişim KAPALI)

| Tablo | SELECT | INSERT | UPDATE | DELETE | Realtime |
|-------|--------|--------|--------|--------|----------|
| `customers` | backend | backend | backend | backend | admin JWT |
| `customer_emails` | backend | backend | backend | backend | — |
| `customer_pin_auth` | backend | backend | backend | backend | — |
| `auth_sessions` | backend | backend | backend | backend | — |
| `push_subscriptions` | backend | backend | backend | backend | — |
| `app_error_logs` | backend | backend | — | — | — |
| `email_codes` | backend | backend | backend | backend | — |
| `auth_rate_limits` | backend | backend | backend | backend | — |
| `app_state` | backend | backend | backend | backend | — |
| `app_state_backups` | backend | backend | backend | backend | — |
| `coupon_uses` | backend | backend | backend | backend | — |
| `check_ins`, `referrals`, `feedback`, vb. | backend | backend | backend | backend | — |

**Risk notu:** Faz 1 sonrası anon REST ile bu tablolara erişim kesilir — istenen davranış.

### B) Public read (aktif kayıtlar)

| Tablo | Policy | Kim SELECT? | Yazma |
|-------|--------|-------------|-------|
| `menu_categories` | `select_active_menu_categories` | anon + authenticated | backend only |
| `menu_items` | `select_menu_items` | anon + authenticated | backend only |
| `campaigns` | `select_active_campaigns` | anon + authenticated (`active=true`) | backend only |
| `coupons` | `select_active_coupons` | anon + authenticated (`active=true`) | backend only |

**Etkilenen endpoint:** Menü/kampanya verisi zaten `/api` üzerinden — ek risk düşük.

### C) Realtime authenticated (Faz 3)

| Tablo | Policy | Koşul |
|-------|--------|-------|
| `customer_loyalty` | `customer_select_own_loyalty` | `customer_id = JWT.customer_id` |
| `loyalty_events` | `customer_select_own_loyalty_events` | kendi customer_id |
| `loyalty_events` | `admin_select_loyalty_events` | `is_admin && admin_verified` |
| `in_app_notifications` | `customer_select_own_notifications` | kendi veya `target_type=all`, `is_active` |
| `customers` | `admin_select_customers` | admin JWT verified |
| `push_send_log` | `admin_select_push_send_log` | admin JWT verified |

**JWT üretimi:** `api/_lib/supabaseRealtimeJwt.js` — login/register/session/admin-pin yanıtlarında `realtimeToken`.

---

## Etkilenebilecek Endpoint'ler

| Endpoint | RLS sonrası beklenen |
|----------|---------------------|
| `POST /api/auth/register-complete` | ✅ postgres bypass |
| `POST /api/auth/login` | ✅ + `realtimeToken` |
| `GET /api/auth/session` | ✅ + `realtimeToken` |
| `POST /api/auth/admin-pin` | ✅ + admin `realtimeToken` |
| `GET/POST /api/qr/*` | ✅ |
| `POST /api/admin/*` | ✅ (session guard) |
| `POST /api/push/register` | ✅ |
| `GET /api/realtime` | ✅ (session guard) |
| Frontend Supabase REST `.from()` | N/A — kullanılmıyor |
| Frontend Realtime | ⚠️ Faz 3 + `SUPABASE_JWT_SECRET` gerekli |

---

## Uygulama Adımları

```bash
# 1) Vercel'e SUPABASE_JWT_SECRET ekle (Dashboard → API → JWT Secret)
# 2) Faz 1
npm run db:apply-rls:phase1
npm run smoke:rls

# 3) Faz 2
npm run db:apply-rls:phase2
npm run smoke:rls

# 4) Faz 3 (JWT secret şart)
npm run db:apply-rls:phase3
npm run smoke:rls
node scripts/smoke-realtime-deploy.mjs
```

## Zorunlu Manuel Testler (RLS sonrası)

1. Yeni kayıt → email kodu → PIN → ana ekran
2. Normal login (telefon+PIN)
3. Admin login `05058665406` → admin panel
4. Normal kullanıcı admin API → 403
5. QR generate (<2sn)
6. QR redeem → LP + loyalty_events
7. Menü görüntüleme + admin düzenleme
8. Kampanya/kupon
9. Push kayıt + admin gönderim
10. Realtime LP güncelleme + logout channel cleanup
11. Anon hassas tablo okuma denemesi → reddedilmeli

## Store Hazırlık Blocker'ları

- [ ] RLS 3 faz uygulandı
- [ ] `SUPABASE_JWT_SECRET` Vercel production
- [ ] Cihaz smoke (TestFlight + Android)
- [ ] Yeni mobil build (realtimeToken + push fix)
- [ ] `privacy.html` güncel metin
