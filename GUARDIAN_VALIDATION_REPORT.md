# GUARDIAN_VALIDATION_REPORT.md

Liberte Guardian v1 doğrulama raporu. **Bu turda düzeltme yapılmadı**; yalnızca kod incelendi ve riskler raporlandı.

Genel sonuç: **Guardian v1 güvenli ve uygulamayı bozmuyor.** İki gerçek sınırlama mevcut (serverless bellek kalıcılığı ve istemci polling azaltma boşluğu) — kritik değil ama bilinmeli. Aşağıda kanıtlarıyla.

---

## 1. Guardian endpoint güvenliği

Kaynak: `api/_lib/handlers/guardian.js` (`handleGuardian`).

- **Public endpoint:** Yalnızca temel health.
  Koşul: `resource === 'health' && !service && method === 'GET' && query.detailed !== '1'` → `handlePublicHealth`.
  Yani sadece `GET /api/guardian/health` (servissiz, detailed değil) public.
- **Admin + admin PIN gerektiren endpointler:** Diğer her şey. `requireAdmin(req,res)` = `requireAdminSession(req,res,{ pinRequired:true, light:true })`. Token yoksa **401**, PIN doğrulanmamışsa **403 (needsAdminPin)**, admin değilse **403**.
  - `GET /api/guardian/health?detailed=1`
  - `GET /api/guardian/health/:service` (db/auth/qr/loyalty/realtime/config)
  - `GET|POST /api/guardian/incidents`
  - `GET|POST /api/guardian/safe-mode`
  - `POST /api/guardian/report`
  - `POST /api/guardian/test-alert`
  - `GET /api/guardian/metrics`, `snapshot`

- **`safe-mode`, `incidents`, `report`, `test-alert` public erişime kapalı mı?** **EVET, kapalı.** Public branch yalnızca servissiz GET health'i yakalar; bu dördü `switch`'ten önce `requireAdmin` kapısından geçer. Test ile doğrulandı:
  - `tests/guardian-safe-mode.test.mjs` → "Admin oturumu olmadan safe-mode değiştirilemez (401)".
  - `tests/guardian-health.test.mjs` → "Admin oturumu olmadan incidents listesi alınamaz (401)".

- **Public health secret/DB URL/token/email/PII döndürüyor mu?** **HAYIR.** `handlePublicHealth` yalnızca `{ ok, status, service:'overall', safeMode:<boolean>, userMessage, requestId, timestamp }` döner. `services` (p95/detay), `metrics`, `incidents`, `alerts` **public yanıtta yok**. Test: `tests/guardian-health.test.mjs` → "Public health hassas detay (services/metrics) sızdırmaz".

**Risk:** Düşük. ✔️ Güvenlik modeli doğru.

---

## 2. Serverless memory riski (en önemli sınırlama)

Kaynak: `guardianMetrics.js`, `guardianIncidents.js`, `guardianSafeMode.js`, `guardianAlerts.js` — tümü `globalThis.__liberteGuardian*` üzerinde bellek tabanlı.

- **Vercel'de kalıcı OLMAYAN veriler:** metrik ring buffer (son 500 olay), incident listesi (son 100), Safe Mode config, alert kuyruğu (son 50). Hepsi lambda **instance** belleğinde tutulur.
- **Farklı function / instance / cold start davranışı:**
  - Her `api/*.js` ayrı lambda. `sqlRequest` metriği, isteğin düştüğü **o instance'ın** belleğine yazılır. `/api/guardian/*` çağrısı **başka bir instance'a** düşebilir → admin panel o instance'ın (kısmen boş) metriklerini görür.
  - Cold start sonrası bellek sıfır → incident/metrik/safe-mode kaybolur (Safe Mode "kapalı" görünür).
  - Yük altında birden çok instance varsa veriler **parçalı** olur; sayımlar gerçek toplamın altında kalabilir.
  - **Admin'in açtığı Safe Mode** yalnızca isteğin gittiği instance'ta etkilidir; diğer instance'lar bunu bilmez (ve diğer API yanıtları `x-safe-mode: off` döndürebilir).
- **`006_guardian.sql` yeterli mi?** Şema olarak yeterli (`guardian_safe_mode`, `guardian_incidents` + index, opsiyonel `guardian_events`). **ANCAK kod henüz bu tabloları kullanmıyor** — v1 saf bellek. Yani migration tek başına kalıcılık sağlamaz; v2'de read/write entegrasyonu gerekir. Migration **otomatik uygulanmıyor** (kural gereği), additive ve rollback notlu.
- **Migration uygulanmadan Guardian v1 sınırları:**
  - Incident/metrik/safe-mode tek instance + tek yaşam döngüsü kapsamında doğru; instance'lar arası ve cold start sonrası **kalıcı değil**.
  - Admin panel "anlık" doğru, "tarihsel/birikimli" değil.
  - Safe Mode global olarak garanti edilemez (instance'a bağlı).
  - Alert spam-guard sayaçları da bellekte → cold start sonrası tekrar bildirim olabilir.

**Risk:** Orta (fonksiyonel doğruluk değil, **gözlemlenebilirlik tutarlılığı**). Düşük trafikli/tek-warm-instance senaryoda (bu kafe uygulaması) pratikte büyük ölçüde çalışır. Kalıcılık isteniyorsa v2 + `006_guardian.sql` gerekir.

---

## 3. Safe Mode davranışı

Kaynak: `guardianRules.js` (kurallar), `guardianSafeMode.js` (config/TTL).

- **Açılma koşulları (otomatik):** yalnızca `evaluateAndIntervene()` çağrıldığında, yani **admin detaylı health** (`GET /api/guardian/health?detailed=1`) istendiğinde değerlendirilir. Kurallar:
  - 7.1 DB: art arda 3 ölçüm ≥3000ms **veya** 5 dk'da ≥5 timeout.
  - 7.2 Login: art arda 3 ölçüm ≥8000ms **veya** ≥5 örnek ve hata oranı ≥%20.
  - 7.3 LP: art arda 5 ölçüm ≥10000ms **veya** ≥5 timeout.
  - 7.4 QR: ≥5 timeout **veya** p95 ≥5000ms.
  - 7.5 Realtime: ≥5 örnek ve hata oranı ≥%40 (→ degraded).
- **Eşikler fazla agresif mi?** **Hayır, aksine muhafazakâr.** "Art arda N ölçüm" + yüksek ms eşikleri (3–10 sn) tek bir yavaş istekte tetiklenmez. Tek not: değerlendirme yalnızca admin detaylı health'i açtığında çalışır → otomatik müdahale **proaktif değil, admin görüntülediğinde reaktiftir** (bunu bilinçli not ediyorum; cron/tick yok).
- **TTL dolunca:** `readSafeModeSync()` her okumada TTL kontrol eder; `expiresAt` geçmişse Safe Mode **otomatik kapanır** (`defaultSafeMode`, reason'a "TTL doldu" eklenir). Varsayılan TTL 60 dk. Test: `guardian-safe-mode.test.mjs` → "TTL dolunca otomatik kapanır".
- **Kapanınca eski ayarlara dönüyor mu?** **Evet (sunucu tarafı kesin).** `disableSafeMode()` → `normalFeatures()`. İstemci: `x-safe-mode: off` header'ı bir sonraki API yanıtıyla gelince `applySafeModeHeader('off')` → `shouldReduceFullStatePull/Polling` false döner → `useCommit` normal aralığa döner. **Lag:** istemci değişikliği en geç bir sonraki istek/polling turunda öğrenir (anlık değil).
- **Customer login / LP / QR akışını bozma riski:** **Yok.** Safe Mode yalnızca polling/realtime/full-state-pull **azaltır**; QR `enabled`, loyalty `enabled_with_short_timeout`, push `enabled`. LP/QR/login işlevsel olarak çalışmaya devam eder (sadece arka plan güncellemeleri seyrekleşir).

**⚠️ BULGU (sınırlama, bug değil):** `safeMode.js` içinde `shouldReducePolling()` = `enabled && features.polling === 'reduced'`. İstemci yalnızca `x-safe-mode` header'ı aldığında `features` **boş** kalır (tam config'i sadece admin `fetchSafeMode/health` ile çeker). Dolayısıyla **müşteri istemcilerinde Safe Mode polling'i azaltmaz**; yalnızca `shouldReduceFullStatePull()` (header-only durumda da true) devreye girer. Polling azaltma pratikte admin istemcisinde veya config çekildikten sonra etkili. Bu, "Safe Mode tüm istemcilerde polling'i kısar" beklentisini tam karşılamaz. **Risk: Düşük** (full state pull zaten kısılıyor; egress'in asıl ağır kısmı odur). v2 için: header ile birlikte özet feature bilgisini taşımak veya istemcinin safe-mode config'i hafifçe çekmesi önerilir.

---

## 4. Performance

- **Health check kendi DB/API yükü oluşturuyor mu?**
  - **Public `GET /api/guardian/health`:** her çağrıda `checkOverall()` → `checkDb()` **1 adet `SELECT 1` DB ping'i** (6 sn timeout ile yarıştırılır) + QR imza/realtime/config kontrolleri (env okuma, DB yok). Yani **çağrı başına 1 hafif DB ping**. Sık dış pinglenirse hafif DB yükü olur (note).
  - **Detaylı health (admin):** ek olarak `evaluateAndIntervene()` (bellek metrik değerlendirmesi, DB yok) + `getMetricsSnapshot` (bellek). DB yükü yine ~1 ping.
- **Admin Sistem Sağlığı ekranı kaç sn'de bir istek atıyor?** `useGuardianHealth` `DEFAULT_INTERVAL_MS = 30_000` → **30 sn'de bir**, ve yalnızca **sayfa aktifken** (`usePageActive`) ve panel açıkken (`SystemHealthPanel` sadece `tab==='saglik'` render edilir). Arka planda/başka sekmede istek atmaz. ✔️ Makul.
- **Client telemetry her request'te server'a ekstra istek gönderiyor mu?** **HAYIR.** `guardianTelemetry.recordRequest` tamamen **yerel bellek**; ağ çağrısı yok. `apiClient.apiJson` içinde mevcut yanıttan ölçüm alır, ekstra istek üretmez. ✔️
- **Ring buffer boyutları makul mü?** Evet: metrics 500, incidents 100, alerts 50, client telemetry 100. Bellek ayak izi küçük, otomatik budama var. ✔️

**Risk:** Düşük. Tek not: public health'in çağrı başına DB ping'i — agresif dış izleme yapılandırılırsa hafif yük; gerekirse cache eklenebilir (v2).

---

## 5. API compatibility (`sqlRequest.js`)

- **CORS / Set-Cookie / auth / OPTIONS / native / Vercel response davranışını bozuyor mu?** **Hayır.**
  - Guardian, `sqlRequest`'e yalnızca **2 ek header** (`x-guardian-status`, `x-safe-mode`) ve **metrik kaydı** ekledi. `x-request-id/x-handler/x-duration-ms` zaten önceki fazda vardı ve testlerle korunuyor.
  - Header'lar handler **çalışmadan önce** set ediliyor; Set-Cookie/CORS header'larına dokunulmuyor (CORS her endpoint'in kendi `applyCors`'unda). 
  - OPTIONS: Guardian handler'ı `if (method==='OPTIONS') return res.status(200).end()`. Diğer endpointler kendi OPTIONS'larını yönetiyor; `sqlRequest` OPTIONS'a özel davranmıyor (değişmedi).
  - `x-safe-mode` değeri `readSafeModeSync()` (senkron bellek, DB yok) → ek gecikme yok.
- **Tüm kritik API'lerde header'lar geliyor mu?** **Evet.** `withSqlRequest` kullanan tüm girişler: `api/{qr,admin,state,auth,realtime,config,push,loyalty,guardian}.js` (grep ile doğrulandı). Hepsi 5 header'ı set eder.
- **Response gönderildikten sonra header set edilen yer var mı?** **Hayır (güvenli).** İlk 4 header handler öncesi set edilir. `x-duration-ms` `patchedEnd` içinde **yalnızca `!res.headersSent` ise** set edilir; metrik kaydı header set etmez. Hata yolunda `if (res.headersSent) return;` ile çift yanıt engellenir. ✔️ (Test: observability-headers.test.mjs geçiyor.)

**Risk:** Düşük. ✔️ Geriye dönük uyumlu.

---

## 6. Incident report güvenliği

Kaynak: `guardianReport.js` + `mask.js`.

- **Secret / DB URL / API key / JWT / Firebase private key sızıyor mu?**
  - DB URL (`postgres://...`) → `[REDACTED]`. ✔️
  - JWT (`eyJ...`) → `[REDACTED_JWT]`. ✔️
  - PEM private key bloğu (Firebase service account dahil) → `[REDACTED_PRIVATE_KEY]`. ✔️
  - `redactObject` ile anahtar adı `secret|password|token|apikey|api_key|private|service_account|database_url` olan alanlar → `[REDACTED]`. ✔️
  - **Genel olarak rapor kodu hiçbir `process.env` değerini okumuyor/yazmıyor** → secret'lar kaynakta zaten yok.
- **Phone / email / customerId maskeleniyor mu?** Evet: `maskPhone` (`05*******06`), `maskEmail` (`t***@…`), `maskCustomerId` (`cu********89`); serbest metinde e-posta ve uzun sayı dizileri otomatik maskelenir. Test: `guardian-mask-report.test.mjs`, `guardian-incidents.test.mjs` (PII sızmıyor).
- **`CURSOR_FIX_PROMPT` PII/secret içeriyor mu?** Hayır; yalnızca incident başlığı/belirtiler/dosya adları (hepsi `redactText`'ten geçer) + sabit talimat metni. Test: "Cursor fix prompt secret/PII içermez ve kısıtları belirtir".

**⚠️ Küçük artık risk:** Resend API key formatı (`re_...`) regex desenlerinde **özel olarak yakalanmıyor** (yalnızca anahtar-adı bazlı redaksiyon var). Pratikte raporlara env değeri girmediği için sızma yolu yok; yine de v2'de `re_[A-Za-z0-9]+` deseni eklenmesi önerilir. **Risk: Çok düşük.**

---

## 7. Manuel runtime test planı (öneri — bu turda kod çalıştırılmadı)

| Senaryo | Beklenen | Doğrulama yolu |
|---|---|---|
| Customer login | Teknik hata yok; yavaşsa nazik mesaj; tam pull ertelenir | Slow 3G ile giriş |
| Admin login + PIN | PIN'siz Sistem Sağlığı verisi gelmez (401/403) | Network sekmesi: `/api/guardian/*` |
| Sistem Sağlığı sekmesi | Kartlar + incident + son istekler render; 30sn'de bir yenile | Panel açıkken Network |
| Safe Mode aç/kapat | Açınca `x-safe-mode: on:…`; kapanınca `off`; full pull azalır | API yanıt header'ları |
| QR generate | `enabled`; yavaşsa "QR oluşturuluyor" | QR tabı |
| LP action | Kısa timeout + "tekrar basmayın"; çift tık engeli | Kasa akışı |
| Slow network | Gecikme telemetriye düşer | `getRecentRequests` (panel) |
| Offline | networkError telemetride; kullanıcıya nazik hata | Uçak modu |
| DB degraded simülasyonu | DB p95↑ → admin health açıldığında incident + Safe Mode | Detaylı health birkaç kez |
| Test alert | Admin panel uyarısı + (yapılandırılmışsa) e-posta | "Test alert" butonu |

**Not (test 9 — DB degraded):** Otomatik müdahale yalnızca **admin detaylı health çağrıldığında** değerlendirildiği için, gerçek "proaktif" tetikleme yok. Simülasyonda incident görmek için admin'in Sistem Sağlığı'nı açması (veya health çağırması) gerekir.

---

## Özet risk tablosu

| Alan | Risk | Aksiyon |
|---|---|---|
| Endpoint güvenliği | Düşük ✔️ | Aksiyon gerekmez |
| Serverless bellek kalıcılığı | **Orta** | Kalıcılık gerekirse v2 + `006_guardian.sql` entegrasyonu |
| Safe Mode istemci polling azaltma boşluğu | Düşük | v2: feature bilgisini header/config ile istemciye taşı |
| Otomatik müdahale yalnızca admin health'te tetiklenir | Düşük | İstenirse hafif cron/warm-tick eklenebilir |
| Public health DB ping yükü | Düşük | Gerekirse kısa cache |
| Resend key regex maskesi yok | Çok düşük | v2: `re_…` deseni ekle |
| API uyumluluğu | Düşük ✔️ | Aksiyon gerekmez |
| Rapor secret/PII maskeleme | Düşük ✔️ | Aksiyon gerekmez |

**Sonuç:** Guardian v1 üretim için güvenli; iş mantığını/akışları bozmuyor, secret/PII sızdırmıyor, yetki modeli doğru. Bilinmesi gereken ana sınırlama **serverless bellek kalıcılığı**dır; kalıcı gözlemlenebilirlik için `006_guardian.sql` ile v2 entegrasyonu önerilir. Bu raporda **hiçbir kod değiştirilmedi**.
