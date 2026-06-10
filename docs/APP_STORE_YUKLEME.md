# App Store / TestFlight / Play Store — Yedekleme ve yayın rehberi

Liberte Gastro Cafe sadakat uygulaması için mağaza bilgileri, CI/CD, imzalama ve release sonrası kontrol listesi.

Apple inceleme notu ayrı dosyada kalır: `APP_STORE_REVIEW.md` (App Store Connect → **App Review Information**).

**Bu dosyaya asla yazılmaz:** private key içeriği, `.p8` / `.p12` dosya içeriği, sertifika şifreleri, Apple ID şifresi, gerçek müşteri bilgileri.

---

## App Store Connect bilgileri

| Alan | Değer |
|------|--------|
| App adı | Liberte Gastro Cafe |
| Bundle ID | `cafe.liberte.app` |
| SKU | `liberte-gastro-cafe-ios` |
| App Store Connect App ID | `6778118148` |
| Privacy Policy URL | https://app.liberte.cafe/privacy |
| Age Rating | 4+ |
| Pricing | Free |
| Birincil kategori | Food & Drink (veya Lifestyle) |

### Mağaza açıklaması (EN — Description)

```
This is the official loyalty app for Liberte Gastro Cafe.

Customers can log in with phone number and PIN, view their loyalty card, show their QR code at the cafe, browse menu items, view campaigns, and manage their profile.

Loyalty stamps and rewards are managed by authorized cafe staff.
```

### Subtitle (EN, max 30 karakter)

```
Loyalty & rewards at the cafe
```

### Keywords (EN)

```
loyalty,cafe,coffee,qr,rewards,stamps,liberte,gastro,menu
```

### Sadakat metni (uygulama içi referans)

> Liberte'de müdavim olmak kazandırır. 7. kahven, 7. tatlın ve 12. burgerin bizden.

---

## Bundle ID

```
cafe.liberte.app
```

Capacitor, Android `applicationId` ve iOS `PRODUCT_BUNDLE_IDENTIFIER` bu değerle eşleşmelidir.

---

## App adı

| Bağlam | Ad |
|--------|-----|
| App Store / mağaza listesi | Liberte Gastro Cafe |
| iPhone ana ekran (CFBundleDisplayName) | Liberte |
| Uygulama içi üyelik markası | Liberte Club |

---

## SKU

```
liberte-gastro-cafe-ios
```

---

## App Store App ID

```
6778118148
```

App Store Connect → uygulama URL'sinde görünür. API ve Codemagic yayın adımlarında referans olarak kullanılır.

---

## Codemagic workflow bilgisi

| Alan | Değer |
|------|--------|
| Workflow adı | `ios-release` |
| Dosya | `codemagic.yaml` (repo kökü) |
| Instance | `mac_mini_m2` |
| Node.js | `22` (Capacitor CLI >= 22) |
| Xcode | `latest` |
| Marketing version | `1.0.0` (`APP_VERSION`) |
| Build number | Codemagic `$BUILD_NUMBER` |

### Environment variable group

Grup adı: **`app_store_connect`**

| Değişken | Açıklama |
|----------|----------|
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID (Codemagic secret) |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | API Key ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | `.p8` içeriği (Codemagic secret; repoda yok) |

### API Key ID (public identifier)

```
6PVPHHT2VT
```

Yalnızca Key ID; private key içeriği repoda ve bu dosyada tutulmaz.

### Build adımları

1. Node.js 22 (`nvm install 22` / `nvm use 22`)
2. `npm install` → `npm run build` → `npx cap sync ios`
3. `agvtool` ile sürüm / build numarası
4. `xcode-project use-profiles`
5. `xcode-project build-ipa`
6. TestFlight yükleme (`submit_to_testflight: true`)

### Xcode

| Alan | Değer |
|------|--------|
| Proje | `ios/App/App.xcodeproj` |
| Scheme | `App` |

---

## Signing reference bilgileri

Codemagic UI → **Code signing identities** (manuel yükleme).

| Tür | Reference name |
|-----|----------------|
| iOS Distribution certificate | `liberte_distribution` |
| App Store provisioning profile | `liberte_app_store_profile` |

### `codemagic.yaml` eşlemesi

```yaml
ios_signing:
  provisioning_profiles:
    - liberte_app_store_profile
  certificates:
    - liberte_distribution
```

### Distribution

App Store (TestFlight + App Store incelemesi).

### Repoda ignore edilen imza dosyaları

`.p8`, `.p12`, `.key`, `.mobileprovision`, `.cer`, `.csr`, `.pem`, `.jks`, `.keystore` — `.gitignore` ile hariç tutulur.

---

## Privacy Policy URL

| Sayfa | URL |
|-------|-----|
| Gizlilik Politikası | https://app.liberte.cafe/privacy |
| Kullanım Şartları | https://app.liberte.cafe/terms |

Eski yönlendirmeler: `/gizlilik` → `/privacy`, `/kullanim-sartlari` → `/terms`.

### Politikada beyan edilen veriler

- Ad soyad
- Telefon
- E-posta
- Doğum tarihi (isteğe bağlı)
- Sadakat kartı / damga / ikram bilgileri
- Kampanya geçmişi
- Push bildirim tokenı (bildirim amacıyla)

### Uygulama davranışı ile uyum notu

Yukarıdaki liste uygulama ile uyumludur. Ek olarak:

- **Cihaz kimliği (`deviceId`):** Oturum güvenliği için; gizlilik metninde açıkça adlandırılmamış, operasyonel teknik veri.
- **Davet kodu:** Sadakat programı kapsamında; kampanya / üyelik verisi ile ilişkili.
- **Kamera:** Yalnızca yönetici QR tarama ekranında; konum veya galeri erişimi yok.

---

## App Review demo hesap notları

Demo bilgileri **repoda placeholder** olarak tutulur. Gerçek PIN App Store Connect **Notes** alanından Apple'a iletilir.

`APP_STORE_REVIEW.md` dosyasındaki İngilizce kısa not kopyalanır:

```
Demo account:
Phone: [DEMO_PHONE]
PIN: [DEMO_PIN]
```

Test akışı: Giriş → **Kartım** → QR göster. Yönetici akışı için ayrı demo hesap App Store Connect notlarında belirtilir.

---

## TestFlight bilgileri

### Akış

```
GitHub main → Codemagic ios-release → IPA → App Store Connect → TestFlight
```

### Test adımları

1. App Store Connect → **TestFlight** → build **Ready to Test**
2. iPhone'a TestFlight uygulamasını kur
3. Internal Testing grubuna test Apple ID ekle
4. Giriş, QR, menü, profil, hesap silme akışlarını doğrula

### Export Compliance

Standart HTTPS şifreleme dışında özel şifreleme yoksa **No** seçilebilir.

### App Store incelemesine geçiş

TestFlight testi sonrası → **Prepare for Submission** → screenshot + metadata → **Submit for Review**.

---

## iPad/iPhone screenshot ölçüleri

App Store Connect'e yüklenen ekran görüntüsü boyutları (piksel, portrait):

### iPhone (zorunlu önerilen)

| Cihaz | Boyut |
|-------|--------|
| iPhone 6.9" / 6.7" (ör. 15 Pro Max) | 1290 × 2796 |
| iPhone 6.5" (ör. 11 Pro Max) | 1242 × 2688 |
| iPhone 6.3" / 6.1" (ör. 15 Pro) | 1179 × 2556 |

### iPad (uygulama iPad'de destekleniyorsa)

| Cihaz | Boyut |
|-------|--------|
| iPad Pro 12.9" (6. nesil) | 2048 × 2732 |
| iPad Pro 12.9" (2. nesil) | 2048 × 2732 |
| iPad 10.5" | 1668 × 2224 |

En az bir iPhone 6.7" ve bir iPhone 6.5" seti yüklenmesi önerilir.

---

## Play Store kapalı test notları

Ayrıntılı rehber: `docs/PLAY_STORE_YUKLEME.md`.

| Alan | Değer |
|------|--------|
| Paket adı | `cafe.liberte.app` |
| Mağaza adı | Liberte Gastro Cafe |
| Referans sürüm | `1.0.8` (versionCode `9`) |

### Dahili test komutu

```powershell
npm run publish:android:internal
```

- Servis hesabı JSON: `android/play-console-service-account.json` (git'e eklenmez)
- Gizlilik URL: https://app.liberte.cafe/privacy
- Her yüklemede `versionCode` +1 (`android/app/build.gradle`)

---

## Release sonrası kontrol listesi

### App Store (onay / yayın sonrası)

- [ ] App Store Connect durumu: **Ready for Sale** veya **Pending Developer Release**
- [ ] Canlı uygulama: giriş, QR, menü, kampanyalar, profil
- [ ] **Hesabımı Sil** akışı production'da çalışıyor
- [ ] Privacy URL canlı: https://app.liberte.cafe/privacy
- [ ] Terms URL canlı: https://app.liberte.cafe/terms
- [ ] Push bildirim izni ve kampanya bildirimi test edildi
- [ ] App Store sayfasındaki açıklama ve screenshot güncel

### TestFlight / CI

- [ ] Codemagic `ios-release` son build başarılı
- [ ] `app_store_connect` env group değişkenleri Codemagic'te tanımlı
- [ ] Signing referansları (`liberte_distribution`, `liberte_app_store_profile`) geçerli
- [ ] Node 22 build adımı log'da doğrulanmış

### Güvenlik / repo

- [ ] `.p8`, `.p12`, `.key`, `.cer`, `.pem`, `.env` dosyaları commit edilmemiş
- [ ] `.gitignore` imza ve ortam dosyalarını kapsıyor
- [ ] API Key private key yalnızca Codemagic secret'ta
- [ ] Play Console servis hesabı JSON repoda yok

### Play Store (Android)

- [ ] Dahili test build yüklü ve tester'lar erişebiliyor
- [ ] `versionCode` bir sonraki yükleme için artırılmaya hazır
- [ ] Veri güvenliği formu privacy policy ile uyumlu

### İşletme

- [ ] Demo / inceleme hesapları production'da aktif (Apple red sonrası yeniden test)
- [ ] Destek e-postası (`liberteserdivan@gmail.com`) izleniyor
- [ ] Apple inceleme / kullanıcı geri bildirimleri için yanıt planı hazır
