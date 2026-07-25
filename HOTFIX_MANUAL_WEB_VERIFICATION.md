# Hotfix Manuel Web Doğrulama (doldurulacak şablon)

> Bu adımlar gerçek hesap + Supabase SQL Editor erişimi gerektirir; ajan tarafından
> çalıştırılamaz. Sonuçları aşağıdaki boşluklara yaz. **Gerçek telefon/e-posta/token/
> müşteri verisi YAZMA** — yalnızca status, süre ve `requestId` (LBT-...) gibi PII'siz
> bilgiler.

- **Commit:** `85dcf83` (kod) + `19738ae` (docs/SQL)
- **Production:** https://app.libertegastrocafe.com
- **Test tarihi/saati:** ___________

---

## 1) daily_claims tablo kontrolü (Supabase SQL Editor)
`scripts/sql/check-daily-claims.sql` çalıştır.

- `to_regclass('public.daily_claims')` sonucu: ☐ `daily_claims` (var)  ☐ `NULL` (yok)
- Sütunlar (type/day/name/phone) mevcut mu: ☐ Evet ☐ Hayır
- `uq_daily_claims_customer_type_day` index var mı: ☐ Evet ☐ Hayır

**NULL/eksikse:** `scripts/sql/008_daily_claims_ensure.sql` uygula, sonra tekrar kontrol et.
- 008 uygulandı mı: ☐ Evet ☐ Hayır/Gerekmedi
- Uygulama sonrası `daily_claims_ready`: ___________

---

## 2) Logout → tekrar login süresi (gerçek hesap, DevTools Network açık)
Adımlar: giriş → çıkış → hemen tekrar giriş.

- `POST /api/auth/login` status / süre: _______ / _______ ms
- Login sonrası ana ekran açılma süresi (algılanan): _______ sn
- Tekrarlayan `GET /api/auth/session` döngüsü oldu mu: ☐ Hayır ☐ Evet
- `/api/state` REMOTE_BACKOFF ile reddedildi mi: ☐ Hayır ☐ Evet
- "Hesap bilgilerin yüklenemedi" zorla-logout görüldü mü: ☐ Hayır ☐ Evet
- `x-safe-mode` değeri: _______ (beklenen: `off`)
- Örnek `requestId` (login): ___________
- **Sonuç:** ☐ 2 dk problemi GİTTİ ☐ Hâlâ yavaş (detay: __________)

## 3) Daily LP claim
Ana sayfa → "Günlük giriş ödülünü al (+1 LP)".

- `POST /api/loyalty/daily-claim` status: _______
- Dönen `code` (varsa): _______ (örn. yok / DAILY_CLAIMS_TABLE_MISSING / DATABASE_TRANSIENT)
- LP arttı mı, buton gizlendi mi: ☐ Evet ☐ Hayır
- Aynı gün ikinci claim → "bugün zaten aldın" (400): ☐ Evet ☐ Hayır
- Örnek `requestId`: ___________
- **Sonuç:** ☐ Çalışıyor ☐ Net hata mesajı veriyor ☐ Bozuk (detay: __________)

---

## Genel karar
- Web doğrulama temiz mi: ☐ EVET → Codemagic iOS/Android build başlatılabilir
                          ☐ HAYIR → önce sorun çözülmeli (detay: __________)
