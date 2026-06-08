# App Store / TestFlight / Play Store — Yayın rehberi

Liberte Gastro Cafe sadakat uygulaması (`cafe.liberte.app`) için mağaza metadata, TestFlight, Codemagic iOS derlemesi ve Play Store dahili test notları.

Apple inceleme notu ayrı dosyada kalır: `APP_STORE_REVIEW.md` (App Store Connect → **App Review Information** alanına kopyalanır).

---

## App Store Connect metadata

### Temel bilgiler

| Alan | Değer |
|------|--------|
| Uygulama adı | Liberte Gastro Cafe |
| Bundle ID | `cafe.liberte.app` |
| SKU | `liberte-club` |
| Birincil dil | Türkçe veya İngilizce (tercihe göre) |
| Kategori | Food & Drink (veya Lifestyle) |

### Subtitle (EN, max 30 karakter)

```
Loyalty & rewards at the cafe
```

### Subtitle (TR, max 30 karakter)

```
Sadakat kartı ve ikramlar
```

### Description (EN)

App Store Connect → **Description** alanına yapıştırın:

```
This is the official loyalty app for Liberte Gastro Cafe.

Customers can log in with phone number and PIN, view their loyalty card, show their QR code at the cafe, browse menu items, view campaigns, and manage their profile.

Loyalty stamps and rewards are managed by authorized cafe staff.
```

### Description (TR, isteğe bağlı lokalizasyon)

```
Liberte Gastro Cafe'nin resmi sadakat uygulaması.

Müşteriler telefon numarası ve PIN ile giriş yapabilir, sadakat kartlarını görüntüleyebilir, kafede QR kodlarını gösterebilir, menüyü inceleyebilir, kampanyaları takip edebilir ve profillerini yönetebilir.

Sadakat damgaları ve ikram hakları yetkili kafe personeli tarafından yönetilir.
```

### Promotional Text (EN, isteğe bağlı, max 170 karakter)

```
Earn stamps on coffee, dessert & burgers. Show your QR at Liberte Gastro Cafe and unlock free rewards.
```

### Keywords (EN)

```
loyalty,cafe,coffee,qr,rewards,stamps,liberte,gastro,menu
```

### Sadakat metni (uygulama içi / mağaza açıklamasında referans)

> Liberte'de müdavim olmak kazandırır. 7. kahven, 7. tatlın ve 12. burgerin bizden.

### Screenshot ve görsel gereksinimleri

- iPhone 6.7" ve 6.5" ekran görüntüleri
- Uygulama ikonu App Store Connect'e ayrı yüklenir (Xcode asset'lerinden)

---

## TestFlight bilgileri

### Derleme akışı (Codemagic)

```
GitHub main → Codemagic ios-release workflow
  → npm install / build / cap sync ios
  → IPA imzalama
  → App Store Connect → TestFlight (otomatik)
```

### Codemagic workflow

- **Ad:** `ios-release`
- **Dosya:** `codemagic.yaml` (repo kökü)
- **Marketing version:** `1.0.0` (`APP_VERSION`)
- **Build number:** Codemagic `$BUILD_NUMBER` (her build benzersiz olmalı)

### TestFlight test adımları

1. [App Store Connect](https://appstoreconnect.apple.com) → **TestFlight**
2. Build durumu **Processing** → **Ready to Test** olana kadar bekle (genelde 5–30 dk)
3. iPhone'a **TestFlight** uygulamasını kur
4. **Internal Testing** grubuna test Apple ID ekle
5. Liberte Gastro Cafe build'ini kur ve test et

### Export Compliance

TestFlight'ta **Export Compliance** sorusu: şifreleme yalnızca standart HTTPS ise **No** seçilebilir.

### App Store incelemesine geçiş

TestFlight testi tamamlandıktan sonra App Store Connect → **Prepare for Submission** → metadata + screenshot → **Submit for Review**.

İnceleme notu için `APP_STORE_REVIEW.md` kullanın; bu dosyadaki demo PIN değerleri Apple'a oradan iletilir.

---

## Privacy Policy bilgileri

### Canlı URL'ler

| Sayfa | URL |
|-------|-----|
| Gizlilik Politikası | https://app.liberte.cafe/privacy |
| Kullanım Şartları | https://app.liberte.cafe/terms |

Eski URL'ler otomatik yönlendirilir: `/gizlilik` → `/privacy`, `/kullanim-sartlari` → `/terms`.

### App Store Connect

- **Privacy Policy URL:** `https://app.liberte.cafe/privacy`
- **App Privacy** anketi: toplanan veri türlerine göre doldurulmalı (telefon, e-posta OTP, sadakat verisi vb.)

### Uygulama içi erişim

Giriş ve profil ekranlarından Gizlilik Politikası ve Kullanım Şartları herkese açık sayfalara gider.

### Hesap silme (Apple Guideline 5.1.1)

Profil → **Hesabımı Sil** — kalıcı silme sunucu tarafında yapılır.

---

## Demo hesap bilgileri

Yalnızca **test / inceleme** amaçlı hesaplar. Gerçek müşteri bilgileri bu dosyaya yazılmaz.

PIN değerleri güvenlik nedeniyle repoda tutulmaz; App Store incelemesinde `APP_STORE_REVIEW.md` veya App Store Connect **Notes** alanından Apple'a iletilir.

### Demo müşteri

| Alan | Değer |
|------|--------|
| Telefon | `5550100001` |
| PIN | İnceleme notunda ayrı iletilir |
| Test akışı | Giriş Yap → telefon + PIN → **Kartım** → QR göster |

### Demo yönetici (kasiyer)

| Alan | Değer |
|------|--------|
| Telefon | `5550100002` |
| Müşteri PIN | İnceleme notunda ayrı iletilir |
| Yönetici kasa PIN | Sunucu ortam değişkeni (`ADMIN_PIN`); repoda ve bu dosyada yok |
| Test akışı | Giriş → **Yönetici PIN** → **QR Tara** → müşteri QR okut → damga / ikram |

### QR testi

1. Demo müşteri **Kartım** sekmesinde QR gösterir.
2. Demo yönetici **QR Tara** ile kodu okutur.
3. Kategori damgası veya ikram işlemi uygulanır.

---

## Codemagic iOS build notları

### Ön koşullar

- Codemagic hesabı repo'ya bağlı (`liberteserdivan/liberte-club-app`)
- Mac gerekmez; build Codemagic macOS runner'da çalışır

### Environment variable group

Codemagic UI → **Environment variables** → grup adı: **`app_store_connect`**

| Değişken | Açıklama |
|----------|----------|
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API Issuer ID |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | API Key ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | `.p8` anahtar içeriği (Codemagic secret olarak; repoya yazılmaz) |

### Build adımları (`codemagic.yaml`)

1. Node.js 22 (`nvm install 22` — Capacitor CLI >= 22 gereksinimi)
2. `npm install`
3. `npm run build`
4. `npx cap sync ios`
5. `agvtool` ile sürüm / build numarası
6. `xcode-project use-profiles` — manuel imza profillerini uygula
7. `xcode-project build-ipa` — archive + IPA
8. App Store Connect → TestFlight yükleme (`submit_to_testflight: true`)

### Xcode projesi

| Alan | Değer |
|------|--------|
| Proje | `ios/App/App.xcodeproj` |
| Scheme | `App` |
| Instance | `mac_mini_m2` |

### Sürüm numaraları

| Alan | Kaynak | Not |
|------|--------|-----|
| Marketing version | `APP_VERSION` (`1.0.0`) | Codemagic build'de agvtool ile set edilir |
| Build | `$BUILD_NUMBER` | Her Codemagic build'de otomatik artar |

Yerel `project.pbxproj` sürümü build anında güncellenir; repo'daki değer referans amaçlıdır.

### Sorun giderme

| Hata | Olası çözüm |
|------|-------------|
| Unknown variable group | `codemagic.yaml` → `app_store_connect` grup adı Codemagic UI ile eşleşmeli |
| NodeJS >= 22 | `node: 22` ve nvm adımı aktif olmalı |
| Code signing / profile | Codemagic'te sertifika ve profil referans isimleri doğru mu kontrol et |
| Duplicate build | App Store Connect'te aynı build numarası kullanılmış; yeni build tetikle |

### Alternatif: GitHub Actions

Repo'da `.github/workflows/ios-testflight.yml` ve `ios/fastlane/` mevcuttur. Birincil iOS CI yolu **Codemagic** olarak kullanılmaktadır.

---

## Signing bilgileri

Manuel code signing — Codemagic UI → **Code signing identities** üzerinden yüklenir. Şifreler ve anahtar dosya içerikleri repoda tutulmaz.

### Referans isimleri (Codemagic)

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

### Apple Developer

| Alan | Değer |
|------|--------|
| Bundle ID | `cafe.liberte.app` |
| Distribution | App Store |

### Repoda olmaması gerekenler

- `.p12` / `.p8` dosyaları ve içerikleri
- Sertifika veya profil şifreleri
- Apple ID şifresi
- Private key metni

Bu dosyalar yalnızca Codemagic UI veya güvenli yerel depolamada tutulur; `.gitignore` ile repodan hariç tutulur.

---

## Play Store kapalı test notları

Android tarafı ayrıntılı rehber: `docs/PLAY_STORE_YUKLEME.md`.

### Temel bilgiler

| Alan | Değer |
|------|--------|
| Paket adı | `cafe.liberte.app` |
| Mağaza adı | Liberte Gastro Cafe |
| Güncel sürüm (referans) | `1.0.8` (versionCode `9`) |

### Dahili test (internal / kapalı test)

```powershell
npm run publish:android:internal
```

- Gradle Play Publisher ile AAB derlenir ve **internal** kanalına yüklenir
- Servis hesabı JSON: `android/play-console-service-account.json` (git'e eklenmez)
- İlk yüklemeden önce Play Console'da uygulama kaydı tamamlanmış olmalı

### Surum notları

```
android/app/src/main/play/release-notes/tr-TR/
  default.txt
  internal.txt
  production.txt
```

Her yeni yüklemede `versionCode` +1 zorunludur (`android/app/build.gradle`).

### Play Console zorunlu alanlar

- Gizlilik politikası URL: `https://app.liberte.cafe/privacy`
- Veri güvenliği formu
- İçerik derecelendirmesi

### Dahili test kontrol listesi

1. Play Console → **Internal testing** → tester e-postaları ekle
2. Opt-in link ile test cihazında yükle
3. Giriş, QR, menü, profil ve hesap silme akışlarını doğrula
4. Production'a geçmeden önce kapalı test geri bildirimlerini topla

### Sorun giderme (özet)

| Hata | Çözüm |
|------|--------|
| `403 Forbidden` | Servis hesabı Play Console'da yetkilendirilmemiş |
| Version code already used | `versionCode` artır |
| API not enabled | Google Play Android Developer API etkinleştir |
