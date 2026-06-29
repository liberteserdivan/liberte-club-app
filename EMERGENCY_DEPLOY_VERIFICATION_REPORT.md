# Emergency Deploy Verification Report

Tarih: 2026-06-29
Commit: `3fa40e7` — fix: fail fast session reads and stop production retry storm
Deploy: production `dpl_FHmUAf7my1sBuSph7PLHRk5DoT7U` (READY) → https://app.liberte.cafe
Vercel env: `VITE_DISABLE_REALTIME=true` (Production) eklendi ve **bu env ile yeniden build edilerek** deploy alındı.

## 1. HTTP seviyesinde fail-fast doğrulaması (production)

Kimlik gerektirmeyen uçlarda yanıt süresi + status ölçüldü (curl, max-time 130s).
Amaç: önceki 60–120sn askıda kalma / 504 / 18sn 500 davranışının bittiğini kanıtlamak.

| Uç | Önce (cihaz) | Cold ölçüm | Warm ölçüm | Sonuç |
|----|-------------|-----------|-----------|-------|
| GET /api/guardian/health (public) | 504 · ~90s | **200 · 2.94s** | **200 · 0.52s** | ✅ 504 yok, deadline çalışıyor |
| GET /api/auth/session (cookiesiz) | 500 · ~18s | **200 · 0.63s** | **200 · 0.33s** | ✅ 18sn 500 döngüsü yok |
| GET /api/realtime?resource=customer-loyalty | ERR · 90–120s | **401 · 0.62s** | **401 · 0.28s** | ✅ pending yok, hızlı yanıt |
| POST /api/push?action=register-device | 504 · ~60s | **401 · 0.66s** | — | ✅ bloklamıyor |
| GET /api/state (cookiesiz) | ERR · ~50s | **401 · 0.50s** | — | ✅ hızlı yanıt |

`/api/guardian/health` gövdesi:
```json
{"requestId":"LBT-106D6F","ok":true,"status":"healthy","service":"overall","safeMode":false,"userMessage":null}
```
(Server tarafı gerçekten sağlıklı; envelope + requestId düzgün dönüyor.)

> Not: 401'ler beklenen ve doğru davranıştır — oturum/çerez göndermeden çağrıldıkları için
> uç hızlıca "Oturum gerekli" döner. Önemli olan **askıda kalmadan** dönmeleridir.

## 2. Kabul kriterleri karşılığı

| Kriter | Durum | Kanıt |
|--------|-------|-------|
| Login ekranı 60–120sn beklemeyecek | ✅ (sunucu) | session okuma 6sn fail-fast; uçlar <1s |
| auth/session 18sn 500 döngüsü | ✅ | 200 · 0.33–0.63s; transient'te artık 503 |
| realtime 90–120sn pending | ✅ | 0.28–0.62s; ayrıca VITE_DISABLE_REALTIME=true |
| push/register-device login'i bloklamıyor | ✅ | 0.66s + client fire-and-forget (5sn timeout) |
| guardian/health 90sn 504 | ✅ | 0.52–2.94s; 8sn deadline guard |
| Guardian "Sağlıklı" yanlış raporu | ✅ (birim test) | `deriveClientHealth` testleri — bkz. aşağı |
| Safe Mode'da arka plan yükü azalır | ✅ (kod) | realtime kapanır, LP poll 120sn |

## 3. Birim test doğrulaması (deploy commit'i içinde)
- `npm test`: **353/353 pass** (9 yeni emergency testi).
- `deriveClientHealth`, kullanıcının verdiği gerçek telemetry örneğiyle overall **healthy
  DEĞİL** döndürüyor; auth+realtime+config+push incident'ları üretiyor → panel artık
  client hatası varken yeşil göstermez.
- `backgroundCircuit`: 3 hata → devre açık, başarı/reset sıfırlar.
- `isCustomerRealtimeDisabled`: Safe Mode realtime degraded → realtime kapalı.

## 4. Tarayıcı/PWA üzerinde MANUEL doğrulama gerekenler (oturum gerektirir)

Aşağıdaki akışlar gerçek bir oturum/çerez gerektirdiğinden başsız (headless) HTTP ile
sürülemez; üretim tarayıcısında/PWA'da hızlıca teyit edilmelidir:

- [ ] **logout → tekrar login süresi**: 20sn+ "Giriş yapılıyor…" takılması olmamalı
      (sunucu uçları <1s döndüğü için beklenmiyor).
- [ ] **Safe Mode AÇIK iken** login / QR / LP ana akışı çalışıyor mu? (realtime kapalı,
      poll 120sn'ye düşer; ana akış etkilenmemeli).
- [ ] **Safe Mode KAPALI iken** login / QR / LP ana akışı normal mi?
- [ ] Admin panelinde, cihazda hata varken **Sistem Sağlığı** kartları "Kritik/Yavaş/Sorunlu"
      gösteriyor mu (yeşil kalmıyor mu)?

## 5. Mobil build durumu
Talimat: "Mobil build'i henüz başlatma" + "Mobil build sadece web doğrulaması temiz
çıkarsa başlatılsın." HTTP seviyesindeki tüm kriterler **temiz** çıktı; ancak oturum
gerektiren akışlar (bölüm 4) manuel teyit beklediği için **mobil build BAŞLATILMADI**.
Bölüm 4 teyidi olumlu gelirse Codemagic iOS + Android build'leri başlatılabilir.
