# Liberte Club — Canliya Gecis Denetim Raporu

Tarih: 2026-06-29
Kapsam: Web (PWA) + Android + iOS. Auth, LP/sadakat, gunluk odul, kamera/QR, bildirim, sunucu/DB kararliligi, admin paneli botu (Guardian) ve guvenlik.
Yontem: Tamami SALT-OKUMA kod incelemesi. Hicbir uygulama kodu degistirilmedi. Bu rapor "once yolu cizelim" amaciyla hazirlandi.

---

## 1. Yonetici Ozeti ve Go-Live Karari

Uygulama mimarisi genel olarak **olgun**: parametreli SQL, sunucu tarafi yetki katmanlari, fail-fast okuma, transaction ici kilit/timeout, retry storm icin devre kesici, PII maskeleme. Ancak **canliya bu haliyle cikilmamalidir.** Asagidaki bulgular tek baslarina veri sizintisi, donma veya yanlis odul/puan uretebilir.

GO-LIVE KARARI: **HAYIR — once "Release Blocker" maddeleri kapatilmali.**

En kritik 6 madde (detaylari bolum 2):
1. RLS uretimde KAPALI + musteri PII tablolari Realtime'a acik + anon key istemcide (KVKK riski).
2. QR imza anahtari ADMIN_PIN'den turetiliyor (offline PIN kirma + token sahteciligi).
3. Admin tam-state yazimi N+1 (binlerce seri sorgu) -> uye sayisi arttikca kesin donma/timeout.
4. Tam-state yazma yolunda statement_timeout/attemptTimeout yok -> bayat baglantida donma.
5. Kayit (register) akisi withSqlRetry ile sarili -> transient hatada cifte referral LP / cifte oturum.
6. daily_claims semasi/migration uretimde eksikse TUM gunluk odul durur (503).

---

## 2. RELEASE BLOCKER (canliya cikmadan ONCE kapatilacak)

| # | Alan | Bulgu | Sonuc |
|---|------|-------|-------|
| RB-1 | Guvenlik | RLS kapali + customers/customer_loyalty Realtime publication'da + anon key frontend'de | Tum musteri PII'si (telefon/eposta/ad) API yetkisi baypas edilerek dogrudan DB'den okunabilir |
| RB-2 | Guvenlik | QR_SIGNING_SECRET yoksa imza 4-6 haneli ADMIN_PIN'den turetiliyor (`api/_lib/qrToken.js:8-25`) | Tek gecerli token ile ADMIN_PIN offline brute-force; istenen customerId icin QR forge |
| RB-3 | Sunucu/DB | `persistStateToRelational` her musteri/loyalty/menu icin seri await (`api/_lib/relationalState.js:184-199`) | Admin POST /api/state donar; 60sn maxDuration asilir (uye sayisiyla kesinlesir) |
| RB-4 | Sunucu/DB | Tam-state yazimda statement_timeout/attemptTimeout yok (`api/_lib/runSql.js:9-17`, transaction disinda) | Bayat baglantida yazim TCP timeout'una kadar asili kalir |
| RB-5 | Sunucu/DB | `authRegisterComplete.js:366` tum `handleComplete` withSqlRetry ile sarili | Transaction sonrasi transient hatada cifte referral LP, cifte Set-Cookie/oturum |
| RB-6 | LP/Gunluk | daily_claims tablo/sutun/UNIQUE index uretimde elle uygulanmali (`scripts/sql/008_daily_claims_ensure.sql`) | Eksikse tum kullanicilar gunluk odul alamaz (503 DAILY_CLAIMS_TABLE_MISSING) |
| RB-7 | LP/Odul | Dogum gunu kahvesi dedup relational modda bozuk (`loyaltyStore.js:191-195` miniState.history=[]) | Musteri dogum gununde tekrar tekrar ucretsiz ikram alabilir (gelir kacagi/suistimal) |
| RB-8 | Guvenlik/DB | daily_claims `ensureDailyClaimsSchema` uretimde DDL atlanmiyor (`dailyClaimsStore.js:12`) | Her cold-start ilk claim'de CREATE UNIQUE INDEX -> pooler'da kilit/donma |

Not: RB-8 ve RB-6 ayni tabloyla ilgili; dogru cozum migration'i bir kez elle uygulayip kodda uretim DDL'ini kapatmaktir.

---

## 3. Alan Bazli Bulgular

### 3.1 Kimlik Dogrulama (Auth) — giris/cikis/PIN/yavaslik
Tam rapor: [Auth denetimi](53741d49-5e39-4f9f-ad3f-9a873d072eac)

Yuksek:
- `pbkdf2Sync(120000, sha512)` SENKRON -> event loop'u bloklar; kafede eszamanli girislerde herkes sira bekler. Async `pbkdf2`'ye gecilmeli. (`api/_lib/pinAuth.js:29-52`)
- Login'de 3 katmanli ic ice retry + rate-limit sayacinin her retry'da artmasi -> yanlis 429 + gecikme. Rate-limit kontrolu retry blogunun DISINA alinmali. (`authLogin.js:110-113,207`)
- Ortak cafe IP'sinde `maxHits=20` -> mesru musteriler 429 ile kilitlenebilir. Auth limiti telefon/hesap bazli olmali. (`rateLimit.js:73-77`)
- Rate-limit SELECT->UPDATE atomik degil (yaris kosulu); tek `INSERT ... ON CONFLICT` yapilmali.

Orta:
- `getSession` her cagrida gereksiz musteri+loyalty sorgusu + okuma yolunda yazma. (`auth.js:75-108,222-282`)
- Bootstrap ve admin-pin akislarinda cift retry / cift getSession turu.
- Suresi dolan auth_sessions ve auth_rate_limits hic temizlenmiyor (periyodik purge yok).
- PIN sifirlama/degisiminde diger cihaz oturumlari iptal edilmiyor (30 gun gecerli kalir).

Olumlu: cikis (logout) hizli ve yerel temizligi senkron; admin-members retry storm devre kesici + dedup ile kontrol altinda.

### 3.2 LP / Sadakat ve Gunluk Odul
Tam rapor: [LP denetimi](cfb224db-4464-4824-af18-62cb83ca6f12)

- "LP ekleyememe" birincil neden: admin manuel LP ucu `runSql` retry OLMADAN cagriliyor -> tek transient hatada 500. (`adminMemberLoyalty.js:43-49`) QR ucu dogru sariyor; manuel uc de sarilmali + idempotency anahtari eklenmeli.
- "LP ekleyememe" ikincil: urun secimi zorunlu kategoride menuItem yoksa "urun secimi gerekli" 403/hata. UI'de urun secim modali zorunlu acilmali. (`loyaltyOps.js:54-61`)
- "Gunluk odul alamama" birincil: RB-6 (daily_claims eksikligi).
- "Gunluk odul alamama" ikincil: commit SONRASI baglanti koparsa runSql retry ikinci denemede UNIQUE catismasi -> basarili claim "bugun zaten aldin" gibi gorunur. `bumpAppStateRevision`/cache invalidasyonu runSql kapsami DISINA alinmali. (`customerRewards.js:143-148`)
- RB-7 dogum gunu dedup hatasi.
- Relational optimistic lock atlaniyor (eszamanli admin lost update). (`appState.js:420-437`)
- wheelSpins/couponUses/checkIns/firstOrderBonuses/referrals hala JSON blob'da buyuyor; normalize tablolar mevcut, tasinmali.
- Cark/kupon/ilk siparis client fonksiyonlari write-guard ile celisir (su an UI'de pasif; acilirsa 403).

Olumlu: relational LP yolu FOR UPDATE + statement_timeout + nonce ile yaris/cift-yazmaya karsi saglam; gunluk claim dedup `(customer_id,type,day)` dogru; gun anahtari Europe/Istanbul sabit.

### 3.3 Bildirim (Push)
Tam rapor: [Bildirim denetimi](b807c0eb-6078-452e-978a-cdf9329893a9)

Onemli: push KODU saglam; sorunlarin cogu ENV + Firebase Console yapilandirmasi.

Alamama:
- Native config (google-services.json / GoogleService-Info.plist) repoda yok; env'den uretiliyor. Env yoksa Android/iOS token uretemez. (KRITIK config)
- Web VAPID anahtari kodda bos; `FIREBASE_VAPID_PUBLIC_KEY` env veya `/api/config` sart. (Yuksek - web)
- iOS APNs .p8 Firebase'e yuklenmemisse `third-party-auth-error` -> iOS'a ulasmaz. (Yuksek - iOS)
- iOS entitlement sabit `production`; debug build sandbox uyumsuzlugu. (Orta - gelistirme)
- Push kayit 5sn timeout + 3 hatada devre kesici -> token sunucuya hic ulasmayabilir. (Orta)

Gonderememe:
- `FIREBASE_SERVICE_ACCOUNT_JSON` eksik/bozuk/yanlis proje -> PUSH_PROVIDER_UNAVAILABLE. (KRITIK config)
- Hedef kitlede izinli/gecerli token yok -> sent:0.
- Rate limit (20) / admin PIN.

Dogrulama: `GET /api/config?resource=push-status` ile vapidReady/adminReady/fcmAuthOk tek noktadan teyit edilebilir (kod degisiklik gerektirmez).

Teknik borc: `api/_lib/firebaseConfig.js` icinde kullanilmayan ikinci SW ureticisi (farkli ikon) — kafa karistirir.

### 3.4 Kamera / QR
Tam rapor: [Kamera QR denetimi](110a9e3d-9982-4f0e-8e30-1371c2714f8b)

- Yuksek (UX): Ayni QR ile ayni kategoriye 2. damga 409 ("zaten kullanildi"). Replay anahtari `(nonce,action)` + nonce token basina sabit. Tekrarli islemler icin qty parametresi veya `(nonce,action,seq)`. (`adminLoyalty.js:90-104`)
- Orta: `pruneExpiredQrNonces` hic cagrilmiyor -> qr_used_tokens sinirsiz buyur.
- Orta: `nativeBarcodeScan.js:5` yorumu Podfile (pod ekli) ile celisir; iOS native/web yolu gercek cihazda dogrulanmali.
- Orta: iOS web fallback ve saf web'de kamera izni on-kontrolu yok; izin reddinde belirsiz mesaj.
- Orta: QR imza ADMIN_PIN'e bagimli (RB-2 ile ayni kok).

Olumlu: HMAC-SHA256 + sabit zaman karsilastirma + 90sn TTL + transaction ici atomik nonce replay korumasi.

### 3.5 Sunucu Kararliligi / Veritabani
Tam rapor: [Sunucu DB denetimi](2e806ac7-69c4-4f36-bb7a-d74f46c72588)

Kritik: RB-3, RB-4, RB-5, RB-8 (yukarida).
Yuksek:
- `max=3` + tek paylasilan istemci + seri await zincirleri -> agir admin istegi hafif istekleri (login/state) sira bekletir.
- `appStateCache` process-local; cok-instansli Vercel'de 20sn'ye kadar bayat veri / yanlis 409.
- `composeStateFromRelational` ~9 seri round-trip; history LIMIT 2000.

Orta:
- `serializeAppStateJson` veriyi 3 kez dolasiyor (double-encode); legacy tam-blob yazim yollari hala mevcut.
- `saveAppState` her yazimdan once yedek icin tam tabloyu okuyor (2x maliyet).
- `runWithAttemptTimeout` timeout sonrasi arkadaki sorguyu iptal etmiyor; `resetSqlClient` eski istemciyi kapatmiyor -> gecici baglanti birikmesi.

Olumlu: fail-fast oturum okumalari, transaction ici kilit/timeout, devre kesici, transient->503 kontrollu hata.

### 3.6 Admin Paneli Botu (Guardian / Approval Autopilot)
Tam rapor: [Admin bot denetimi](b8bbbff7-2957-4d33-be3d-d7b917958519)

Ne yapar: "Sistem Sagligi" sekmesi. Saglik izleme + metrik + incident + alert + rapor + Safe Mode; risk seviyeli otomatik aksiyon onerileri (Level 0-3). Yikici islemler (migration/deploy/delete/secret) allowlist+blocklist ile teknik olarak IMKANSIZ — guvenli kurgulanmis.

Onemli gercekler:
- CRON YOK. `evaluateAndIntervene` yalnizca admin "Sistem Sagligi" sekmesi acikken (30sn) tetikleniyor. "Admin yokken gece korumasi" iddiasi kod gerceguyle celisiyor -> gercek 7/24 otomasyon yok.
- Tum veri BELLEK tabanli (globalThis); cold start/instance degisiminde sifirlanir. Ustuste esik sayan kurallar (3 ardisik yavas) cogu zaman streak'i tamamlayamaz -> kurallar nadiren atesler.
- 006/007 kalicilik SQL'leri taslak, hicbir modul okumuyor.

Riskler: Level 1 (polling/realtime azaltma) ONAYSIZ ve tek instance metrigine dayali -> yanlis pozitifle gereksiz Safe Mode (TTL 60dk, geri alinabilir). Veri kaybi yok.

Calistirma/dogrulama (en guvenli, yan etkisiz): guardian birim testleri:
`node --test tests/guardian-autopilot.test.mjs tests/guardian-health.test.mjs tests/guardian-metrics.test.mjs tests/guardian-safe-mode.test.mjs tests/guardian-incidents.test.mjs tests/guardian-mask-report.test.mjs tests/guardian-request-id.test.mjs tests/guardian-client.test.mjs`
UI: admin+PIN -> Sistem Sagligi -> Safe Mode ac/kapat, Test alert, Incident raporu.

### 3.7 Guvenlik (saldirgan gozuyle)
Tam rapor: [Guvenlik denetimi](0c82047f-5aba-42d6-b2b2-cb10fa1237ee)

Kritik: RB-1 (RLS/PII), RB-2 (QR secret).
Orta:
- CORS: ALLOWED_ORIGINS bossa preview ortaminda her origin credentials ile yansiyor. Tum ortamlarda whitelist set edilmeli. (`http.js:43-52`)
- Admin PIN 4 hane + gevsek limit -> 6 hane + siki limit.
- `pushRegisterDevice.js` ve `realtimeFetch.js` catch bloklari ham error.message donduruyor (bilgi ifsasi) -> publicDbErrorMessage.

Dusuk: nonce'suz token replay korumasini atlar; uretimde nonce/PIN tablosu varlik dogrulamasi; realtime JWT 24s.

Saldirip GECEMEDIGIM (saglam) noktalar: IDOR yok (session.customerId kullaniliyor), musteri yazma kisiti cift katmanli (findCustomerWriteViolations + mergeUserState), SQL injection yok (tagged-template), repoda commit'li gercek SIR YOK, token bellekte + HttpOnly cookie, kapsamli rate limiting, body 16KB limit.

### 3.8 Platform (Android / iOS / Web)
Tam rapor: [Platform denetimi](a0cf79aa-8237-4d02-bb55-f75ca6c32ed7)

- Yuksek (Android): yerel release build google-services.json env'i olmadan sessizce FCM'siz AAB uretir.
- Orta (iOS): APNs key'in Firebase'e yuklu oldugu repodan dogrulanamaz; yayindan once manuel teyit.
- Orta (Web): firebaseVapidKey bos; web push runtime /api/config'e bagimli.
- Orta: surum tutarsizligi (iOS 1.1.29 / Android 1.1.30 / package.json 1.1.22) -> tek surume hizalanmali.
- Iyilestirme: minifyEnabled=false (boyut/obfuscation), allowBackup=true (guvenlik) gozden gecirilmeli.

---

## 4. Yol Haritasi (Onerilen Fazlar)

### Faz 0 — Yapilandirma & Dogrulama (kod yok, hizli, en yuksek oncelik)
- RB-1: `SUPABASE_JWT_SECRET` set + `npm run db:apply-rls:phase1/2/3` + `npm run smoke:rls` + `GET /api/config?resource=db-status` ile dogrula.
- RB-2: Guclu, ADMIN_PIN'den bagimsiz `QR_SIGNING_SECRET` set.
- RB-6: `scripts/sql/008_daily_claims_ensure.sql` uretimde bir kez uygula; `scripts/sql/check-daily-claims.sql` ile dogrula.
- Bildirim ENV'leri: FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_VAPID_PUBLIC_KEY, GOOGLE_SERVICES_JSON, GOOGLE_SERVICE_INFO_PLIST + APNs .p8 yuklemesi -> `push-status` ile teyit.
- CORS: tum ortamlarda ALLOWED_ORIGINS set.

### Faz 1 — Release Blocker kod duzeltmeleri
- RB-3: admin tam-state yazimini toplu upsert (UNNEST/jsonb_to_recordset) veya diff'li yaz.
- RB-4: yazim yollarina `SET LOCAL statement_timeout` / global statement_timeout.
- RB-5: register `withSqlRetry`'i tek-idempotent bloklara indir; referral bonusunu idempotent yap.
- RB-7: dogum gunu dedup'i transaction icinde loyalty_events'ten yukle veya kart alani ile kontrol et.
- RB-8: `ensureDailyClaimsSchema`'ya `if (isProductionRuntime()) return`.

### Faz 2 — Yuksek oncelikli kararlilik & UX
- Auth: async pbkdf2; rate-limit retry disina + atomik sayac; cafe IP limiti telefon bazli.
- LP: admin manuel uca runSql + idempotency; gunluk claim revision bump'i runSql disina.
- Kamera: ayni-kategori tekrar damga (qty/seq); kamera izin on-kontrolu (iOS/web).
- DB: appStateCache revision'a bagla; compose round-trip'leri sinirli paralel; resetSqlClient'te eski istemciyi arka planda kapat.

### Faz 3 — Orta/Dusuk & temizlik
- Auth: cok cihaz token iptali; suresi dolan session/rate-limit purge (guardian cron).
- Bot: gercek cron + kalicilik (006/007) veya "yari otomatik" oldugunu net dokumante et.
- LP: odul listelerini normalize tablolara tasi; legacy tam-blob yazim yollarini kapat.
- Guvenlik: 6 haneli PIN; iki handler ham hata gizleme; realtime JWT TTL kisalt.
- Platform: surumleri hizala; minify/allowBackup gozden gecir; olu SW ureticisini kaldir.

### Faz 4 — Yayin oncesi dogrulama
- `npm test`, `npm run lint`, `npm run build` yesil.
- Guardian testleri + smoke:rls.
- Gercek cihazda: Android/iOS giris, LP ekleme, gunluk odul, QR tarama, bildirim al/gonder.
- Store metadata, surum, imza, gizlilik/sartlar sayfalari.

---

## 5. Go-Live Kontrol Listesi (ozet)

Zorunlu (blocker):
- [ ] RLS 3 faz uygulandi + SUPABASE_JWT_SECRET + canli dogrulama
- [ ] QR_SIGNING_SECRET (ADMIN_PIN'den bagimsiz) set
- [ ] daily_claims migration uygulandi + dogrulandi; uretim DDL kapatildi
- [ ] Admin tam-state yazimi N+1 cozuldu + statement_timeout eklendi
- [ ] Register cifte-yazma riski giderildi (idempotent referral)
- [ ] Dogum gunu kahvesi dedup'i duzeltildi
- [ ] Bildirim ENV'leri + APNs key teyit (push-status yesil)
- [ ] CORS ALLOWED_ORIGINS tum ortamlarda set

Guclu oneri:
- [ ] async pbkdf2 + rate-limit duzeltmeleri
- [ ] admin manuel LP retry/idempotency
- [ ] ayni-kategori tekrar damga UX
- [ ] surum hizalama (web/Android/iOS)

---

## 6. Notlar
- Bu denetimde hicbir uygulama kodu degistirilmedi (istegin uzerine once yol haritasi).
- Botu (Guardian) uretimde "calistirmak" canli ortam + admin PIN gerektirir; en guvenli dogrulama bolum 3.6'daki birim testleridir.
- Hangi fazdan baslamami istersin? Onerim: Faz 0 (yapilandirma) + Faz 1 (blocker kod) birlikte.
