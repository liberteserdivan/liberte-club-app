# Production Stabilization - Kok Neden Analizi

## Ozet

Uretimde musteri uygulamasinin kirilmasina yol acan sorunlar, cekirdek okuma/yazma yollarinin istege bagli veya admin sistemlerle siki baglanmasindan kaynaklaniyordu.

## Belirti - Kok neden

| Belirti | Kok neden |
|--------|-----------|
| /api/state 500 veya 15-20 sn | Bayat pooler retry; legacy tam app_state okuma; GET icinde saveAppState riski |
| /api/loyalty/daily-claim 503 | Gecici DB; istemci throw ile crash hissi |
| /api/admin/members 503 | Admin okuma agir; arka plan 401 logout tetikliyordu |
| Arka plan istekleri uygulamayi kiriyor | apiClient 401 -> global logout; skipUnauthorized eksikti |
| Musteri admin state bagimliligi | Legacy loadAppStateForCustomer tam blob; getSessionForBootstrap ekstra sorgu |

## Teknik detaylar

1. GET /api/state yazma yan etkisi (dogum gunu saveAppState dalı)
2. Legacy musteri tam blob okumasi
3. Agir oturum dogrulama (bootstrap vs QR session)
4. Arka plan 401 logout dongusu
5. Daily claim duplicate/503 istemci exception
6. 503 degraded mode eksikligi

## Kapsam disi

- Migration yok
- Mobile build baslatilmadi
- Otomatik deploy yok
- firebase-admin uuid audit (breaking fix disi)