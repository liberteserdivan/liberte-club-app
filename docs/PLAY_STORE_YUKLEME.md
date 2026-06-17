# Play Console Otomatik AAB Yukleme

Bu proje, Google Play Developer API uzerinden AAB yuklemek icin **Gradle Play Publisher** kullanir. Windows'ta Ruby/Fastlane gerektirmez.

## 1. Google Cloud servis hesabi

1. [Google Cloud Console](https://console.cloud.google.com/) → yeni veya mevcut proje
2. **API'ler ve Hizmetler** → **Kitaplik** → **Google Play Android Developer API** → Etkinlestir
3. **IAM ve Yonetim** → **Servis Hesaplari** → **Hesap olustur**
   - Ornek ad: `play-yukleyici`
4. Olusturulan hesap → **Anahtarlar** → **Anahtar ekle** → **JSON**
5. Indirilen JSON dosyasini su konuma kopyala (git'e eklenmez):

```
android/play-console-service-account.json
```

Ornek sablon: `android/play-console-service-account.json.example`

## 2. Play Console'da yetki ver

1. [Google Play Console](https://play.google.com/console) → **Kullanicilar ve izinler**
2. **Kullanici davet et** degil — **Servis hesabi erisimi** bolumunden JSON'daki `client_email` adresini ekle
3. Asgari izinler:
   - **Surumleri yonet** (Release yonetimi)
   - **Uygulama bilgilerini goruntule** (istege bagli, metadata icin)

Ilk yuklemeden once Play Console'da en az bir kez manuel AAB yuklenmis olmali (uygulama kaydi tamamlanmis olmali).

## 3. Yerel yukleme komutlari

```powershell
# Sadece yukle (mevcut AAB ile)
npm run publish:android

# Derle + dahili test kanalina yukle
npm run publish:android:internal

# Derle + production kanalina yukle
npm run publish:android:production
```

Kanallar: `internal` | `alpha` | `beta` | `production`

### Ortam degiskeni alternatifi

JSON dosyasi yerine tum icerigi tek satirda da verebilirsiniz:

```powershell
$env:ANDROID_PUBLISHER_CREDENTIALS = Get-Content android/play-console-service-account.json -Raw
npm run publish:android:internal
```

## 4. Surum notlari

Surum notlari su klasorde:

```
android/app/src/main/play/release-notes/tr-TR/
  default.txt      — varsayilan
  internal.txt     — dahili test
  production.txt   — production
```

Her yeni surumde bu dosyalari guncelleyin.

## 5. Surum numarasi

Yeni yukleme oncesi `android/app/build.gradle` icinde:

- `versionCode` — her yuklemede +1 (Play Store zorunlu)
- `versionName` — gorunen surum (or. `1.0.8`)

## 6. Codemagic ile otomatik yukleme (onerilen)

GitHub Actions yerine Codemagic `android-release` workflow kullanin. `codemagic.yaml` dosyasina bakin.

Codemagic UI → Environment variables (Secure):
- `GOOGLE_SERVICES_JSON`
- `GOOGLE_SERVICE_INFO_PLIST`
- `PLAY_STORE_SERVICE_ACCOUNT_JSON`

Codemagic UI → Code signing → Android keystore reference: `liberte_club_release`

Baslat: Codemagic → Start new build → workflow **android-release** → branch **main**

## Sorun giderme

| Hata | Cozum |
|------|--------|
| `403 Forbidden` | Servis hesabi Play Console'da davet edilmemis veya izin yetersiz |
| `Version code X has already been used` | `versionCode` artirin |
| `API not enabled` | Google Play Android Developer API etkinlestirin |
| Gradle Java hatasi | `JAVA_HOME` = Android Studio JBR yolu |
