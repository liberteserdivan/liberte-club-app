# App Store / TestFlight — Mac olmadan yayinlama

Bu rehber, **Windows bilgisayardan** iOS uygulamasini App Store'a cikarmak icin hazirlanmistir.
Derleme ve yukleme **GitHub Actions** (bulut Mac) uzerinde yapilir.

Tam rehber: asagidaki fazlar sirasiyla uygulanir.

---

## Genel akis

```
Windows (sen)
  → GitHub repo + Secrets
  → Actions: "iOS TestFlight Publish"
       ↓
GitHub macOS sunucusu (Fastlane + Xcode)
       ↓
TestFlight → iPhone test → App Store inceleme
```

---

## Faz 1 — Apple Developer Program

**Mac gerekmez | Sure: 1–3 gun (onay)**

1. [developer.apple.com/programs](https://developer.apple.com/programs/) → **Enroll**
2. Apple ID ile giris
3. Organization veya Individual sec ($99/yil)
4. Onay bekle

Onay sonrasi:
- [developer.apple.com/account](https://developer.apple.com/account) → **Membership** → **Team ID** (10 karakter)
- Not al: GitHub Secret `APPLE_TEAM_ID`

---

## Faz 2 — Bundle ID ve App Store Connect

**Mac gerekmez | Sure: ~30 dk**

### 2.1 Bundle ID
1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **+** → App IDs
2. Explicit: `cafe.liberte.app`

### 2.2 Uygulama kaydi
1. [App Store Connect](https://appstoreconnect.apple.com/apps) → **New App**
2. Name: **Liberte Gastro Cafe**
3. Bundle ID: `cafe.liberte.app`
4. SKU: `liberte-club`

### 2.3 Zorunlu bilgiler
- Privacy Policy: `https://app.liberte.cafe/gizlilik`
- Kategori + yas derecelendirmesi + App Privacy anketi

---

## Faz 3 — API anahtari ve GitHub Secrets

**Mac gerekmez | Sure: ~15 dk**

### 3.1 API Key
1. [App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. **Team Keys** → **+**
3. Name: `github-actions-liberte`, Access: **App Manager**
4. `AuthKey_XXXX.p8` indir (bir daha indirilemez!)
5. Key ID + Issuer ID not al

### 3.2 GitHub Secrets
Repo → Settings → Secrets → Actions:

| Secret | Aciklama |
|--------|----------|
| `APP_STORE_CONNECT_KEY_ID` | 10 karakter Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | UUID Issuer ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | .p8 dosyasinin tam metni |
| `APPLE_TEAM_ID` | 10 karakter Team ID |

---

## Faz 4 — Ilk TestFlight yuklemesi

**Mac gerekmez | GitHub Actions kullanir**

1. Proje GitHub'da guncel olmali (workflow + fastlane dosyalari)
2. Actions → **iOS TestFlight Publish** → Run workflow
3. `build_number`: her yuklemede artan sayi (ilk: `10`)
4. 15–25 dk bekle
5. App Store Connect → TestFlight → build **Processing**

Ilk calistirmada Fastlane, API ile dagitim sertifikasi ve provisioning profile olusturur.

---

## Faz 5 — iPhone'da test

1. TestFlight uygulamasini kur
2. Internal Testing'e Apple ID ekle
3. Liberte'yi kur ve test et

---

## Faz 6 — App Store'a cikis

**Mac gerekmez — web arayuzu**

1. Screenshot'lar (6.7" ve 6.5" iPhone)
2. Turkce aciklama + anahtar kelimeler
3. `APP_STORE_REVIEW.md` demo hesap bilgileri
4. Submit for Review

---

## Surum numaralari

| Alan | Dosya | Ornek |
|------|--------|-------|
| Version | project.pbxproj `MARKETING_VERSION` | 1.0.8 |
| Build | project.pbxproj `CURRENT_PROJECT_VERSION` | 10 |

Her TestFlight yuklemesinde **build** numarasi benzersiz olmali.

---

## Sorun giderme

| Hata | Cozum |
|------|--------|
| API auth failed | Key ID / Issuer / .p8 kontrol |
| No profile for bundle | Bundle ID kayitli mi |
| Duplicate build | build_number artir |
| Missing compliance | TestFlight → Export Compliance → No |

---

## Projede hazir dosyalar

- `.github/workflows/ios-testflight.yml`
- `ios/fastlane/Fastfile`
- `ios/Gemfile`
- `APP_STORE_REVIEW.md` (inceleme notu)
