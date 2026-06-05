# App Store İnceleme Notu — Liberte Gastro Cafe

## Uygulama özeti

Liberte Gastro Cafe sadakat uygulaması. Müşteriler kayıt olur, **Kartım** sekmesindeki QR kodunu kasada gösterir ve kahve / tatlı / burger kategorilerinde damga toplar. Eşik dolunca ikram hakkı kazanır.

## Sadakat kuralı (müşteriye gösterilen)

> Liberte'de müdavim olmak kazandırır. 7. kahven, 7. tatlın ve 12. burgerin bizden.

## Demo hesaplar

### Demo müşteri
- **Telefon:** 5550100001
- **E-posta:** demo.customer@liberte.cafe
- **Akış:** Giriş Yap → telefon → (yeni cihazda e-posta OTP) → Ana Sayfa → **Kartım** → QR göster

### Demo yönetici (kasiyer)
- **Telefon:** 5550100002
- **E-posta:** demo.admin@liberte.cafe
- **Yönetici PIN:** Vercel `ADMIN_PIN` ortam değişkeninde tanımlı (inceleme ekibine ayrı iletilecek)
- **Akış:** Giriş Yap → telefon → OTP (yeni cihazda) → **QR Tara** → müşteri QR okut → damga / ikram → Profil → Yönetim Paneli → PIN

## QR kullanımı

1. Müşteri **Kartım** sekmesinde kişisel QR kodunu gösterir.
2. Yönetici **QR Tara** sekmesi ile kamerayı açar ve kodu okutur.
3. Kategori damgası veya ikram işlemi uygulanır.

## Hesap silme

Profil → **Hesabımı Sil** — kalıcı silme sunucu tarafında yapılır (Apple Guideline 5.1.1).

## Yasal

Profil ve giriş ekranından **Gizlilik Politikası** ve **Kullanım Şartları** erişilebilir.

## Ortam değişkenleri (production)

- `DATABASE_URL` — Neon PostgreSQL
- `RESEND_API_KEY` — e-posta OTP
- `RESEND_FROM_EMAIL`
- `ADMIN_PIN` — yönetici paneli PIN (istemciye gönderilmez)
