# Realtime / Push / Circuit Breaker Report

## Problem
- `GET /api/realtime` cihazda 16–120sn ERR (askıda).
- `POST /api/push/register-device` 60sn 504, login/ana ekranı blokluyordu.
- 95 istek / 65 hata / 30 timeout → retry storm.

## Devre kesici (yeni paylaşılan modül)
`src/lib/backgroundCircuit.js`
- 3 ardışık hata/timeout → ilgili uç 60sn **devre dışı** (skip).
- `recordSuccess` / `resetCircuit` sıfırlar.
- **Yalnızca arka plan** isteklerini engeller. Kullanıcı manuel aksiyonu (login submit,
  "Bildirimleri aç") devreyi sıfırlar ve asla bloklanmaz.

## Realtime
`src/lib/realtimeFetch.js`
- Müşteri realtime fetch'leri **6sn timeout** + `retryTransient:false`.
- **Path bazlı in-flight dedup**: pending istek varken yeni istek aynı promise'i paylaşır
  → aynı anda iki `/api/realtime` başlamaz.
- Devre açıksa istek hiç başlatılmaz (`canAttempt('realtime')`).

`src/hooks/useCustomerRealtime.js`
- `isCustomerRealtimeDisabled()` (VITE_DISABLE_REALTIME=true **veya** Safe Mode realtime
  degraded) ise websocket kanalı **hiç açılmaz**.

`src/hooks/useCustomerLoyaltyPoll.js`
- Safe Mode/kapalıyken yedek yoklama **120sn**'ye çekilir. Görünürlük/native-active
  kontrolü zaten arka planda yoklamayı durduruyor.

Realtime hatası login/logout ana akışını etkilemez: tüm müşteri fetch'leri
`safeRealtimeRequest` ile sarmalı (hata fırlatmaz, `{ok:false}` döner).

## Push (non-critical)
`src/lib/firebasePush.js`
- `register-device`: **5sn timeout**, `retryTransient:false`, `skipUnauthorized:true`.
- Push devre kesici: 3 hata sonrası bu turda tekrar denemez.
- `resetPushCircuit()` + `enablePush/enableNativePush` başında reset → manuel "Bildirimleri
  aç" engellenmez.
- Tüm çağrılar zaten `try/catch` ile sarmalı; başarısızlık UI'da kritik hata göstermez,
  login/ana ekranı bloklamaz (fire-and-forget).

`src/lib/pushPrompt.js`
- Logout revoke timeout 8sn → 5sn.

Server tarafı: push register-device `requireSession` artık `runSqlRead` ile sınırlı →
bayat bağlantıda 60sn 504 yerine hızlı sonuç.

## Test
`tests/emergency-stability.test.mjs`
- Devre 3 hatada açılır, başarı/reset sıfırlar.
- `isCustomerRealtimeDisabled` Safe Mode realtime degraded ile `true`.

## Kabul
- ✅ Aynı anda iki `/api/realtime` başlamaz (dedup).
- ✅ Realtime 3 hata sonrası 60sn skip edilir.
- ✅ Realtime timeout login ekranını kilitlemez.
- ✅ Push 60sn takılsa bile login tamamlanır.
- ✅ Push 3 hata sonrası tekrar denenmez; manuel aksiyon engellenmez.
