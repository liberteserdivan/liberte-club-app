# Login Background Fetch — Kök Neden Analizi

DevTools kanıtı:

```
GET /api/realtime?resource=admin-customers  → 401
GET /api/state → 500 · 19286ms · LBT-5DD75B
GET /api/state → 401 · 31384ms · LBT-6BFCA6
GET /api/state → 401 · 1228ms  · LBT-92398F
```

## Özet

Login ekranındayken korumalı (protected) arka plan endpoint'leri çalışıyor ve
401/500 dönüp login akışını bozuyordu. Üç ayrı kök neden tespit edildi.

## Kök Neden 1 — Uçuştaki (in-flight) isteklerin oturum değişimini umursamaması

`/api/state` (`useCommit.pullRemote` → `loadRemote`) ve
`/api/realtime?resource=admin-customers` (`useAdminMembers` → `loadAdminMembersSlice`)
istekleri, kullanıcı **logout** olduğunda veya oturum değiştiğinde iptal
edilmiyordu. Cold-DB nedeniyle 19–31 saniye süren bu istekler, çıkış sonrasında
tamamlanıyor ve:

- Sunucu oturumu yok olduğu için **401/500** dönüyor,
- Bu yanıtlar **login ekranında** görünüyor,
- Eski yanıt yeni auth state'ini (login ekranını) **ezebiliyordu**.

`canPullRemote()` yeni istekleri engelliyordu ama **zaten başlamış** istekleri
durdurmuyordu ve yanıtın geçerliliğini oturum nesline göre kontrol etmiyordu.

## Kök Neden 2 — Arka plan 401'inin global logout/churn tetiklemesi

`loadRemote` ve admin-customers fetch'i `skipUnauthorized` kullanmıyor. Bir 401
geldiğinde `apiClient` → `onUnauthorized('expired')` tetikleniyordu. App.jsx'teki
handler ise oturum olup olmadığına bakmadan `logoutSession()` + "Oturumun sona
erdi" bildirimini çalıştırıyordu. Yani login ekranındaki kullanıcı, eski bir
in-flight isteğin 401'i yüzünden churn/yanıltıcı bildirim yaşıyordu.

## Kök Neden 3 — `sessionRef` güncellemesinin effect'e bağlı olması (race)

`sessionRef.current = session` bir `useEffect` içinde yapılıyordu. React effect
sırası nedeniyle, logout sonrası yeniden render'da **`useCommit`'in kendi
effect'i, `sessionRef`'i güncelleyen effect'ten ÖNCE** çalışıyordu. Sonuç:
`canPullRemote()` bayat (eski) session'ı görüp login ekranında bir timer kurabiliyor
veya `/api/state` tetikleyebiliyordu.

## Ek Eksik — `VITE_DISABLE_REALTIME` yalnızca customer'ı kapatıyordu

Acil kill switch yalnızca customer realtime'ı kapatıyordu; admin realtime,
admin-customers, admin feed ve dashboard hâlâ `/api/realtime` çağırabiliyordu.

## Etkilenen Dosyalar

- `src/lib/session.js` — oturum nesli (authEpoch) yoktu.
- `src/hooks/useCommit.js` — `/api/state` yanıtı oturum değişimini kontrol etmiyordu.
- `src/hooks/useAdminMembers.js` — admin-customers yanıtı kontrol edilmiyordu.
- `src/App.jsx` — `onUnauthorized` korumasız; `sessionRef` effect tabanlı; admin realtime flag'e tabi değil.
- `src/lib/safeMode.js` — flag yalnızca customer'ı kapsıyordu.
- `src/lib/realtimeFetch.js` — flag açıkken admin istekleri yine gidiyordu.
