# Mobil gercek cihaz smoke testleri (BrowserStack + Appium)

Liberte Club native uygulamasi icin BrowserStack App Automate uzerinde Appium tabanli smoke test altyapisi.

## On kosullar

Codemagic / CI secret olarak tanimlayin (koda yazmayin):

| Env | Aciklama |
|-----|----------|
| `MOBILE_TEST_PHONE` | Test kullanici telefonu |
| `MOBILE_TEST_PIN` | Test kullanici PIN |
| `MOBILE_TEST_ADMIN_PIN` | Admin PIN (admin senaryolari icin) |
| `BROWSERSTACK_USERNAME` | BrowserStack kullanici adi |
| `BROWSERSTACK_ACCESS_KEY` | BrowserStack erisim anahtari |

Opsiyonel:

| Env | Aciklama |
|-----|----------|
| `MOBILE_ANDROID_APK_PATH` | Yerel veya CI artifact APK yolu |
| `MOBILE_IOS_IPA_PATH` | Yerel veya CI artifact IPA yolu |
| `BROWSERSTACK_APP_ANDROID_URL` | Onceden yuklenmis `bs://` Android URL |
| `BROWSERSTACK_APP_IOS_URL` | Onceden yuklenmis `bs://` iOS URL |
| `MOBILE_E2E_PLATFORMS` | `android`, `ios` veya `android,ios` (varsayilan: ikisi) |
| `MOBILE_API_HOST` | API host (varsayilan: `https://app.liberte.cafe`) |

## Codemagic workflow'lari

| Workflow | Amac |
|----------|------|
| `android-test-artifact` | Release APK uretir — **Play upload yok** |
| `ios-test-artifact` | Signed IPA uretir — **TestFlight upload yok** |
| `mobile-device-tests` | BrowserStack gercek cihaz smoke testleri |
| `android-release` | AAB uretir; Play upload yalnizca `ENABLE_PLAY_UPLOAD=true` ile |

Onerilen sira:

1. `android-test-artifact` ve/veya `ios-test-artifact` calistir
2. Artifact yolunu `MOBILE_ANDROID_APK_PATH` / `MOBILE_IOS_IPA_PATH` olarak `mobile-device-tests` workflow'una ver
3. `mobile-device-tests` calistir — gecmeden store yayini yapilmamali

## Cihaz matrisi

`browserstack/devices.json`:

- Android: Samsung Galaxy S24, Pixel 8, Galaxy S10 (Android 11)
- iOS: iPhone 15 (iOS 17), iPhone 13 (iOS 16)

## Smoke senaryolari

1. Uygulama acilisi (splash sonrasi login veya home)
2. Telefon/PIN login
3. Logout + tekrar login
4. Session restore (relaunch)
5. Admin PIN + admin panel
6. Admin members listesi (`/api/admin/members` basari)
7. Login/logout stabilite (3 dongu)

## Yerel calistirma

```bash
npm install --legacy-peer-deps
export MOBILE_ANDROID_APK_PATH=android/app/build/outputs/apk/release/app-release.apk
export MOBILE_TEST_PHONE=...
export MOBILE_TEST_PIN=...
export BROWSERSTACK_USERNAME=...
export BROWSERSTACK_ACCESS_KEY=...
npm run test:e2e:mobile
```

Tek platform / tek cihaz:

```bash
export BROWSERSTACK_APP_URL=bs://...
export BS_DEVICE_NAME="Google Pixel 8"
export BS_OS_VERSION="14.0"
npm run test:e2e:mobile:android
```

## Rapor

Kosu sonunda `e2e/mobile/reports/mobile-smoke-report.json` uretilir:

- provider, commit, artifact adlari, cihaz listesi, pass/fail ozeti
- fail kayitlarinda: platform, device, step, code, durationMs (PIN/token/telefon yok)
- `noSecretLeak: true`, `noStoreUpload: true` onaylari

## Alternatif saglayicilar

| Oncelik | Saglayici | Not |
|---------|-----------|-----|
| 1 | BrowserStack App Automate | Mevcut altyapı |
| 2 | AWS Device Farm + Appium | `wdio` config kopyalanip endpoint degistirilebilir |
| 3 | Firebase Test Lab | Yalnizca Android hizli smoke; Appium matrisi sinirli |

## Guvenlik

Asla loglanmaz: PIN, admin PIN, sessionToken, Authorization, ham telefon, musteri listesi.

Loglanabilir: platform, deviceName, osVersion, apiHost, path, status, requestId, code, step, durationMs.
