# GUARDIAN_SYSTEM_MAP.md

Liberte Club App — mevcut yapı analizi ve Liberte Guardian entegrasyon haritası.

## 1. Mevcut mimari (entry point / akışlar)

| Alan | Dosyalar | Not |
|---|---|---|
| Frontend entry | `src/main.jsx`, `src/App.jsx` | Oturum bootstrap, realtime/polling hook'ları, admin/customer ayrımı App.jsx'te. |
| API client | `src/lib/apiClient.js`, `src/lib/session.js`, `src/lib/remoteFetch.js`, `src/hooks/useCommit.js` | `apiFetch`/`apiJson` çekirdek; idempotent GET retry, timeout var. |
| Realtime/polling | `src/lib/realtimeManager.js`, `src/hooks/useCustomerRealtime.js`, `useAdminRealtime.js`, `useCustomerLoyaltyPoll.js`, `useAdminMembers.js`, `useAdminDashboardStats.js` | Polling `usePageActive` ile arka planda durur. |
| LP/loyalty | `api/loyalty.js`, `api/_lib/loyaltyStore.js`, `api/_lib/loyaltyOps.js`, `src/components/CustomerQrScanner.jsx`, `src/pages/AdminPage.jsx` | LP transaction'da `SET LOCAL statement_timeout` var; çift tık guard mevcut. |
| QR | `api/qr.js`, `api/_lib/qrToken.js`, `src/pages/QrPage.jsx` | `vercel.json` qr maxDuration 30; web cookie ile direkt generate. |
| Auth/session | `api/auth.js`, `api/_lib/auth.js`, `api/_lib/handlers/authLogin.js`, `authSession.js`, `authAdminPin.js` | `requireAdminSession({ light, pinRequired })` admin+PIN kapısı. |
| DB | `api/_lib/sql.js`, `runSql.js`, `dbConnection.js`, `sqlRequest.js`, `dbTransient.js` | `runSqlRead` 6sn attempt timeout; write tarafı DB statement_timeout'a güvenir. |
| Error/log | `api/_lib/errorLogs.js`, `api/_lib/requestTrace.js`, `src/lib/errorHub.js` | `app_error_logs` tablosu (7 gün retention). |
| Deploy/config | `vercel.json`, `.env.example`, `capacitor.config.json`, `package.json` | Vercel functions (admin/auth/state/loyalty/realtime/qr/push/config), Hobby fonksiyon limiti dikkate alınmalı. |

## 2. Soruların yanıtları (bölüm 0)

- **Mevcut health check var mı?** Kısmen. `GET /api/health` → `/api/config?resource=warm` (ısınma + DB ping) ve `config?resource=db-status/qr-status` (tanılama erişimi gerektirir). Servis bazlı (login/QR/LP/realtime) birleşik health **yoktu** → Guardian ekledi (`/api/guardian/health`).
- **RequestId sistemi var mı?** Vardı (`x-request-id`, hex). Guardian bunu **`LBT-XXXXXX`** biçimine yükseltti; gelen kimlik korunur.
- **API süreleri ölçülüyor mu?** `x-duration-ms` header'ı vardı (sqlRequest). Guardian artık her isteği servis bazında metrik tamponuna kaydeder.
- **Client-side hatalar toplanıyor mu?** `errorHub.js` vardı. Guardian `guardianTelemetry.js` ile son 100 isteğin özetini (durum/süre/timeout/requestId/platform/rol) tutar.
- **Admin'e sistem durumu gösteren ekran var mı?** Yoktu (yalnızca `ErrorLogsAdmin`). Guardian **"Sistem Sağlığı"** sekmesini ekledi (`SystemHealthPanel.jsx`).
- **Safe Mode benzeri yapı var mı?** Yoktu (ama davranışsal azaltmalar — deferred pull, reduced polling — kısmen vardı). Guardian merkezi **Safe Mode** config'i ekledi.
- **Hangi endpointler kritik?** `/api/auth(/login,/session)`, `/api/loyalty`, `/api/qr/generate`, `/api/state`, DB bağlantısı.
- **Hangi sorunlar otomatik toparlanabilir (güvenli)?** Polling azaltma, realtime degraded, full state pull azaltma, admin dashboard refresh azaltma, daily claim geçici kapatma, LP kısa timeout + "tekrar basmayın" mesajı, kullanıcıya yavaşlık mesajı, admin alert, incident + Cursor prompt üretimi.
- **Hangi sorunlarda insan onayı şart?** DB migration, müşteri verisi silme, LP puanı düzeltme, admin yetki değişimi, secret/env değişimi, deploy, kod refactor. Bu durumlarda `requiresHuman: true` + rapor.

## 3. Guardian'ın eklediği parçalar

- Server: `api/guardian.js`, `api/_lib/handlers/guardian.js`, `api/_lib/guardian/*` (constants, requestId, metrics, mask, safeMode, routing, incidents, health, alerts, rules, report).
- Client: `src/lib/guardianTelemetry.js`, `src/lib/guardianClient.js`, `src/lib/safeMode.js`, `src/hooks/useGuardianHealth.js`, `src/hooks/useGuardianSafeMode.js`, `src/components/SystemHealthPanel.jsx` + AdminPage "Sistem Sağlığı" sekmesi.
- Header'lar: `x-request-id` (LBT-), `x-handler`, `x-duration-ms`, `x-guardian-status`, `x-safe-mode`.

## 4. Depolama stratejisi (v1)

Guardian v1 **bellek tabanlıdır** (lambda instance ömrü). Metrikler/incidentlar/safe-mode `globalThis` üzerinde tutulur. Kalıcı çözüm için **opsiyonel** `scripts/sql/006_guardian.sql` migration'ı eklendi (otomatik uygulanmaz; additive + rollback notlu). Bu, "büyük refactor yapma / migration otomatik çalıştırma" kuralına uyar.

## 5. Güvenlik sınırları

- Temel `GET /api/guardian/health` public ama yalnızca durum döner (servis/metrik detayı yok).
- Detaylı health, incidents, safe-mode, report, test-alert → **admin + admin PIN** (`requireAdminSession light + pinRequired`).
- Tüm rapor/incident metinleri `mask.js` `redactText/redactObject` ile temizlenir: DB URL, JWT, private key, e-posta, telefon, uzun sayı dizileri maskelenir; `secret/token/password/...` anahtarları `[REDACTED]`.
