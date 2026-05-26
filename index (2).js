# Liberte Club Full Design Package

Bu paket, son çalıştığımız Liberte Club uygulama yapısının tüm ana dosyalarını içerir.

## İçerik
- index.html
- package.json
- manifest.webmanifest
- public/icon.svg
- public/firebase-messaging-sw.js
- src/main.jsx
- src/style.css
- api/auth/send-email/index.js
- api/auth/verify-email/index.js
- api/state/index.js
- api/push/send/index.js
- docs/NOTLAR.txt

## Özellikler
- Premium siyah/yeşil tasarım
- Mail onaylı giriş
- İsim soyisim zorunlu
- Neon veritabanı state kaydı
- Admin panel
- Kategori yönetimi
- Ürün yönetimi
- Ürün görsel yükleme
- QR sadakat kartı
- Damga/ödül sistemi
- VIP seviye mantığı
- Google yorum yönlendirme
- Instagram / harita / Yemeksepeti linkleri
- Push bildirim izni altyapısı
- Firebase service worker dosyası

## Vercel Environment Variables
DATABASE_URL
RESEND_API_KEY
RESEND_FROM_EMAIL = Liberte Club <noreply@liberte.cafe>
NEXT_PUBLIC_FIREBASE_VAPID_KEY

## GitHub yükleme
ZIP içindeki dosyaları repo köküne yükle.
Önemli yollar:
- src/main.jsx
- src/style.css
- index.html
- package.json
- public/firebase-messaging-sw.js
- api klasörü
