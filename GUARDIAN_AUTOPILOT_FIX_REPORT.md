# Liberte Guardian — Approval Autopilot Raporu

Guardian artık sadece izleyen değil, **onaylı çalışan** bir Autopilot sistemidir.
Bot düşük riskli geçici müdahaleleri otomatik yönetir, orta riskli aksiyonlarda
uygulama içinden **admin + PIN onayı** ister, yüksek riskli aksiyonlarda ise yalnızca
**rapor/Cursor prompt** üretir. Onaysız kalıcı veya veri etkileyen hiçbir işlem yapılmaz.

## Mevcut altyapı korundu
requestId, Safe Mode, incident sistemi, Sistem Sağlığı paneli, Guardian health
endpointleri, client telemetry, PII/secret masking ve admin+PIN güvenliği **bozulmadı**.
DB migration, production verisine müdahale veya büyük refactor yapılmadı.

## Eklenen dosyalar
| Dosya | Sorumluluk |
|---|---|
| `api/_lib/guardian/guardianActionRegistry.js` | Allowlist + blocklist + risk politikası (saf) |
| `api/_lib/guardian/guardianActionProposals.js` | Öneri + uygulama (execution) bellek deposu, dedup, redaction |
| `api/_lib/guardian/guardianActionExecutor.js` | Güvenlik kapıları (blocked/allowlist/approval/ttl/executable) + güvenli aksiyon + rollback |
| `api/_lib/guardian/guardianApprovals.js` | Öneri yaşam döngüsü: üret/onayla/reddet/uygula/geri al + denetim izi |
| `scripts/sql/007_guardian_approvals.sql` | **ÖNERİ** kalıcılık şeması (otomatik uygulanmaz) |
| `tests/guardian-autopilot.test.mjs` | Güvenlik/approval/blocked/ttl/rollback/PII/public testleri |

## Değişen dosyalar
- `api/_lib/handlers/guardian.js` — `actions` resource'u + detaylı health'e `actions` (onay merkezi) eklendi.
- `api/_lib/guardian/guardianRules.js` — Safe Mode **artık otomatik açılmaz**; bot incident+alert üretip **onay bekleyen öneri** oluşturur.
- `src/lib/guardianClient.js` — action endpoint istemcileri (`fetchActionCenter`, `approveAction`, `rejectAction`, `rollbackAction`).
- `src/components/SystemHealthPanel.jsx` + `src/style.css` — **"Guardian Onay Merkezi"** bölümü (risk renkli kartlar, onay/ret/geri al/Cursor prompt).
- `vercel.json` — `/api/guardian/actions/*` rewrite'ları.

## Risk seviyeleri
- **Level 0** (gri) — incident/alert/rapor: otomatik.
- **Level 1** (mavi) — `reduce_polling`, `degrade_realtime`: **HAFİF** koruma (yalnızca polling/realtime; fullStatePull/dailyClaim normal kalır), TTL'li, geri alınabilir, **anında + otomatik** uygulanır. Sorun algılandığında admin yokken bile devreye girer (gece koruması) ve TTL her tetiklemede tazelenir.
- **Level 2** (turuncu) — `enable_safe_mode` (tam Safe Mode: fullStatePull/dailyClaim dahil), `disable_safe_mode`, `show_maintenance_message`: **admin + PIN onayı** olmadan çalışmaz. Kurallar bunu onay önerisi olarak bırakır.
- **Level 3** (kırmızı) — `generate_cursor_fix_prompt` ve tüm blocked aksiyonlar: **asla otomatik uygulanmaz**, yalnızca öneri/rapor.

### Kural davranışı (gece koruması)
Bir sorun algılandığında bot otomatik olarak: incident kaydeder + (gerekiyorsa) admin'e alert üretir + **Level 1 hafif korumayı anında uygular** (polling/realtime azaltılır, TTL'li). Ek olarak **tam Safe Mode'u (Level 2)** admin onayı için öneri olarak bırakır. Böylece admin uyurken bile temel koruma devreye girer, ama fullStatePull/dailyClaim gibi daha etkili kısıtlar yalnızca onayla uygulanır.

## Yasaklı aksiyonlar (asla çalışmaz)
`run_migration`, `deploy_production`, `delete_customer`, `modify_loyalty_balance`,
`change_admin_role`, `change_env_secret`, `change_database_config`,
`change_supabase_config`, `change_vercel_config`, `change_firebase_config`.
Bunlar denenirse: çalıştırılmaz + güvenlik incident'i düşülür + admin'e bildirilir.

## Endpointler (hepsi admin + PIN)
- `GET /api/guardian/actions` — onay merkezi (pending/approved/executed/rejected/humanRequired)
- `GET /api/guardian/actions/:id`
- `POST /api/guardian/actions/propose`
- `POST /api/guardian/actions/:id/approve` — onayla ve uygula
- `POST /api/guardian/actions/:id/reject`
- `POST /api/guardian/actions/:id/execute` — onaylanmışı uygula
- `POST /api/guardian/actions/:id/rollback`

Güvenlik: public erişim 401, admin-PIN'siz 403. `approvedBy` maskeli tutulur, PII/secret döndürülmez.

## Çalıştırma kapıları (executor)
1. Blocklist → çalışmaz. 2. Allowlist dışı → çalışmaz. 3. `executable:false` (L3) → çalışmaz.
4. `requiresApproval` ve onay yok → çalışmaz. 5. `ttlRequired` ve TTL yok → çalışmaz. 6. Parametre/format doğrulanır.

## Komut sonuçları
- `npm test` → **330/330 pass, 0 fail** (yeni: 18 autopilot testi). → `GUARDIAN_AUTOPILOT_TEST_OUTPUT.txt`
- `npm run build` → **✓ built in ~6.7s**. → `GUARDIAN_AUTOPILOT_BUILD_OUTPUT.txt`
- `npm run lint` → **0 error**, 55 warning (hepsi önceden var olan kullanılmayan import vb.). → `GUARDIAN_AUTOPILOT_LINT_OUTPUT.txt`
- `npm audit` → 8 moderate (firebase-admin → google-cloud zinciri; **önceden var, bu işle eklenmedi**). → `GUARDIAN_AUTOPILOT_AUDIT_OUTPUT.txt`

## Kabul kriterleri
- [x] Guardian sorun algıladığında aksiyon önerisi üretir.
- [x] Uygulama içinden admin onayı alınabilir (Onay Merkezi).
- [x] Onay olmadan Level 2 aksiyon çalışmaz.
- [x] Level 3 aksiyonlar asla execute edilmez.
- [x] Blocked action'lar teknik olarak reddedilir + güvenlik incident'i.
- [x] Kullanıcı verisi, LP puanı, admin yetkisi, DB migration, deploy, secret/env otomatik değişmez.
- [x] Safe Mode TTL'li ve rollback'li.
- [x] Admin panelde "Guardian Onay Merkezi" görünür.
- [x] Incident report ve Cursor prompt üretilebilir.
- [x] Secret/PII sızıntısı yok (Resend `re_`, JWT, DB URL, PEM, e-posta, telefon maskelenir).
- [x] Build/test geçiyor.

## Notlar / sınırlar
- v1 **bellek tabanlı** (lambda ömrü). Cold start/çoklu instance'ta öneri geçmişi kalıcı olmayabilir.
  Kalıcılık için `scripts/sql/007_guardian_approvals.sql` hazır (elle uygulanır).
- Otomatik Safe Mode davranışı kasıtlı olarak kaldırıldı: artık öneri olarak gelir ve admin onayı bekler.
