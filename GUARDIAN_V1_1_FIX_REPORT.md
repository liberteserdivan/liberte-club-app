# GUARDIAN_V1_1_FIX_REPORT.md

Liberte Guardian v1.1 — düşük riskli iyileştirmeler. Büyük refactor / DB migration / production verisi müdahalesi **yapılmadı**.

## Özet
- ✅ Safe Mode artık **müşteri istemcilerinde de** doğru çalışıyor (header ile feature propagation).
- ✅ `shouldReducePolling()` müşteri tarafında gerçekten devreye giriyor.
- ✅ Resend API key (`re_...`) maskelemesi eklendi.
- ✅ `useLocalAuth` → `isLocalAuth` yeniden adlandırıldı (helper, hook değil) → **30 yanlış-pozitif lint uyarısı giderildi** (85 → 55).
- ✅ Admin panelde memory-mode sınırlaması açıkça gösteriliyor.
- ✅ Test 312/312 geçti, build başarılı, lint 0 hata.

---

## 1. Safe Mode client propagation düzeltmesi

**Sorun:** Müşteri istemcileri yalnızca `x-safe-mode: on:<level>` alıyordu; `features` boş kaldığından polling azaltma müşteride devreye girmiyordu.

**Çözüm (ek istek yok, minimal + güvenli):** `x-safe-mode` header'ı artık güvenli bayraklar taşıyor:
```
off | on:<level>;poll=<0|1>;fsp=<0|1>;rt=<0|1>
```
- `poll` = polling reduced mı
- `fsp` = customer full state pull kapalı mı
- `rt` = realtime degraded mı

PII/secret (reason, customerId, e-posta, DB) **header'a yazılmaz** (test ile doğrulandı).

- `api/_lib/guardian/guardianSafeMode.js` → `safeModeHeaderValue()` bayrakları üretir.
- `src/lib/safeMode.js` → `applySafeModeHeader()` bayrakları parse edip `features.{polling,fullStatePull,realtime}` kurar; yalnızca gerçek değişimde `notify()`.

Admin tarafı tam `features` config'ini detaylı health / safe-mode endpoint'inden (`applySafeModeConfig`) almaya devam eder.

## 2. `shouldReducePolling()` gerçekten çalışıyor

- `src/lib/safeMode.js` — header parse'ından gelen `features.polling === 'reduced'` artık customer'da da set ediliyor.
- `src/lib/syncPolicy.js` — `resolveSyncIntervalMs({ safeModeReduced })` (v1'de eklenmişti) korunuyor.
- `src/hooks/useCommit.js` — `scheduleSyncTimer` zaten `shouldReducePolling()` kullanıyor; ek olarak **`subscribeSafeMode`** aboneliği eklendi → Safe Mode açıldığında polling aralığı **anında** yeniden hesaplanıyor (bir sonraki sekme/foreground olayını beklemeden). Full state pull azaltma (`shouldReduceFullStatePull`) customer için aktif.

**Ana akış korunuyor:** Safe Mode yalnızca polling/realtime/full-state-pull azaltır; customer login / QR / LP işlevsel olarak çalışmaya devam eder.

**Yeni testler (`tests/guardian-client.test.mjs`):**
- Header `on:incident;poll=1;fsp=1;rt=1` → `shouldReducePolling/shouldReduceFullStatePull/isRealtimeDegraded` true.
- `off` → hepsi false (normal davranış korunur).
- `poll=0;fsp=1` → polling azaltma devreye girmez, full state pull azalır.

## 3. Resend key maskeleme

- `api/_lib/guardian/mask.js`:
  - `redactText` desenlerine `\bre_[A-Za-z0-9_-]{8,}\b` → `[REDACTED_RESEND_KEY]` eklendi.
  - `redactObject` anahtar-adı redaksiyonuna `resend|vapid` eklendi.
- **Testler (`tests/guardian-mask-report.test.mjs`):** `re_...` değeri `redactText`, `CURSOR_FIX_PROMPT` ve `INCIDENT_REPORT` içinde açık yazılmıyor.

## 4. Hook lint uyarıları

**Bulgu:** `useLocalAuth` aslında React hook değil — `() => import.meta.env?.DEV === true` döndüren saf bir helper. "use" ile başladığı için `react-hooks/rules-of-hooks` ~30 yanlış-pozitif üretiyordu (App.jsx, AdminPinGate, DailyTasksStrip, useCommit, db.js, devAuth, errorHub, pushPrompt, qrClient, session, AdminPage, LoginPage, ProfilePage).

**Aksiyon:** Helper `isLocalAuth` olarak yeniden adlandırıldı (13 dosya, ~44 occurrence). **Davranış değişmedi** (aynı dönüş değeri). Tüm `rules-of-hooks` uyarıları kayboldu.

**Sonuç:** Lint **85 → 55 warning, 0 error**. Kalan 55 uyarı önceden var olan stil uyarıları (no-unused-vars, exhaustive-deps) olup bu turun kapsamı dışında ve davranışsal risk taşımıyor.

## 5. Admin panel memory mode uyarısı

`src/components/SystemHealthPanel.jsx` üst kısmına kalıcı uyarı eklendi:
> "Guardian v1 memory mode'da çalışıyor. Cold start veya çoklu instance durumunda geçmiş metrikler ve Safe Mode durumu kalıcı olmayabilir."

Panel yalnızca admin + admin PIN sonrası "Sistem Sağlığı" sekmesinde render edildiği için uyarı yalnızca yetkili admine görünür. Stil: `.guardianMemoryNote` (style.css).

## 6. Komut çıktıları
- `GUARDIAN_V1_1_TEST_OUTPUT.txt` — **312 test, 312 pass, 0 fail**.
- `GUARDIAN_V1_1_BUILD_OUTPUT.txt` — `npm run build` başarılı (`✓ built in ~7s`).
- `GUARDIAN_V1_1_LINT_OUTPUT.txt` — **0 error, 55 warning** (v1: 85 → v1.1: 55).
- `GUARDIAN_V1_1_AUDIT_OUTPUT.txt` — 8 moderate (önceden var olan `firebase-admin`/`@google-cloud/storage` transitive; bu turla eklenmedi).

## Değiştirilen dosyalar
- `api/_lib/guardian/guardianSafeMode.js` — header feature bayrakları.
- `api/_lib/guardian/mask.js` — Resend key maskeleme.
- `src/lib/safeMode.js` — header feature parse.
- `src/hooks/useCommit.js` — safe mode aboneliği + isLocalAuth.
- `src/components/SystemHealthPanel.jsx` — memory-mode uyarısı.
- `src/style.css` — `.guardianMemoryNote`.
- `src/lib/devAuth.js` + 12 dosya — `useLocalAuth` → `isLocalAuth` rename.
- Testler: `tests/guardian-client.test.mjs`, `tests/guardian-safe-mode.test.mjs`, `tests/guardian-mask-report.test.mjs`.

## Kabul kriterleri durumu
- [x] Guardian endpoint güvenliği bozulmadı (public/admin gating değişmedi).
- [x] Public health hassas bilgi döndürmüyor (header yalnızca güvenli bayrak).
- [x] Customer login/QR/LP akışları bozulmadı (yalnızca arka plan azaltma).
- [x] Safe Mode açıkken polling azaltma gerçekten devreye giriyor (customer dahil).
- [x] Raporlarda Resend key dahil secret sızmıyor (test ile).
- [x] Build ve test geçiyor (312/312, build OK).
