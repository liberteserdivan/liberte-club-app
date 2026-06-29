# Faz 0 — Yapilandirma Rehberi (Kod Yok)

Bu adimlar Vercel / Supabase / Firebase konsollarinda senin tarafindan yapilir. Hicbiri kod degisikligi degildir; ama Faz 1 kod duzeltmeleri bu yapilandirmalara dayanir (ozellikle daily_claims migration).

Her adimda DOGRULAMA satirini uygula; yesil olmadan yayina cikma.

---

## 0.1 RLS (Row Level Security) — RB-1 (KRITIK)

Amac: anon key ile musteri PII'sinin dogrudan DB'den okunmasini engellemek.

1. Vercel ortam degiskeni ekle: `SUPABASE_JWT_SECRET` (Supabase Dashboard -> Project Settings -> API -> JWT Secret degeri).
2. RLS fazlarini sirayla uygula (repo scriptleri mevcut):
   - `npm run db:apply-rls:phase1`
   - `npm run smoke:rls:phase1`
   - `npm run db:apply-rls:phase2`
   - `npm run smoke:rls:phase2`
   - `npm run db:apply-rls:phase3`
   - `npm run smoke:rls:phase3`
3. Geri alma gerekirse: `npm run db:rollback-rls:phase3/2/1`.

DOGRULAMA:
- `GET /api/config?resource=db-status` -> RLS durumu ok ve `publicTableCount` beklenen degerde.
- Anon key ile `customers` tablosuna dogrudan SELECT denemesi BOS donmeli/engellenmeli.

Not: `docs/RLS_PLAN.md` su an "production'a uygulanmadi" diyor; bu adim onu kapatir.

---

## 0.2 QR imza anahtari — RB-2 (KRITIK)

Amac: QR imzasinin 4-6 haneli ADMIN_PIN'den turetilmesini durdurmak.

1. Guclu rastgele bir sir uret (>=32 byte). Ornek (lokal terminalde, degeri kimseyle paylasma):
   - `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. Vercel'e `QR_SIGNING_SECRET` olarak ekle (production + preview).
3. ADMIN_PIN'i bu sirdan tamamen bagimsiz tut.

DOGRULAMA:
- Deploy sonrasi `POST /api/qr/generate` calismali (musteri QR uretebilmeli).
- `api/_lib/qrToken.js` log/source artik `ADMIN_PIN_DERIVED` degil olmali (Faz 1'de fallback uretimde kapatilacak).

UYARI: Bu sir degisince eski uretilmis QR'lar gecersiz olur (TTL 90sn oldugu icin pratikte sorun degil).

---

## 0.3 daily_claims migration — RB-6 (KRITIK, Faz 1 RB-8 ile eslesir)

Amac: gunluk odul tablosunun sutun + UNIQUE index'inin uretimde hazir olmasi.

1. `scripts/sql/008_daily_claims_ensure.sql` (idempotent) dosyasini uretim DB'sinde BIR KEZ calistir (Supabase SQL editor veya psql).
   - Tablo hic yoksa once `scripts/sql/001_normalized_schema.sql` daily_claims bolumunu uygula.
2. Faz 1'de kod (RB-8) uretimde otomatik DDL'i kapatacak; bu yuzden migration elle uygulanmis OLMALI.

DOGRULAMA:
- `scripts/sql/check-daily-claims.sql` calistir -> NULL/eksik kolon DONMEMELI.
- Bir test kullanicisiyla gunluk odul al -> 200 ve +LP.

---

## 0.4 Bildirim ENV'leri — (KRITIK config)

Vercel'de tanimli olmali:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (dogru proje: liberte-club; private_key satir kacislari bozulmamis).
- `FIREBASE_VAPID_PUBLIC_KEY` (~88 karakter; Firebase Console -> Cloud Messaging -> Web Push key pair public key).
- Build ortaminda `GOOGLE_SERVICES_JSON` (Android) ve `GOOGLE_SERVICE_INFO_PLIST` (iOS).

Firebase Console:
- iOS icin APNs Authentication Key (.p8 + Key ID + Team ID) yuklenmis olmali.

DOGRULAMA:
- `GET /api/config?resource=push-status` -> `vapidReady:true`, `adminReady:true`, `fcmAuthOk:true`.
- Gercek cihazda 1 web + 1 Android + 1 iOS test bildirimi al.

---

## 0.5 CORS — O-1 (ORTA)

Amac: preview ortaminda her origin'in credentials ile yansimasini engellemek.

1. `ALLOWED_ORIGINS` ortam degiskenini TUM ortamlarda (production + preview) acikca set et (virgule ile ayrilmis tam origin listesi).

DOGRULAMA:
- Yetkisiz bir origin'den gelen istek `Access-Control-Allow-Origin` ALMAMALI.

---

## Faz 0 Tamamlanma Kontrolu
- [ ] SUPABASE_JWT_SECRET + RLS 3 faz + smoke yesil + db-status dogrulandi
- [ ] QR_SIGNING_SECRET set (ADMIN_PIN'den bagimsiz)
- [ ] daily_claims migration uygulandi + check-daily-claims temiz
- [ ] Bildirim ENV'leri + APNs key + push-status yesil
- [ ] ALLOWED_ORIGINS tum ortamlarda set
