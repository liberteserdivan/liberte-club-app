# STATE GET Side-Effect Hotfix Raporu

## Amac
GET `/api/state` cagrisinin okuma sirasinda app state'i kalicilastirmamasi (yazmamasi).
Onceki raporda tespit edilen sorun: legacy/non-relational modda full-admin GET, fail-fast okuma sarmalayicisi (`runSqlReadFast`, 3sn timeout + retry) icinde `saveAppState()` cagirabiliyordu:

- Veri yoksa seed yazimi
- `applyMenuSync` / `migrateAllLoyalty` sonrasi kalicilastirma

Bu durum yavas GET, 500/503 ve okuma yolunda guvensiz (cift) yazma riski yaratiyordu.

## Yapilan En Kucuk Guvenli Degisiklik

### 1. api/_lib/appState.js - seed dali skipPersist'e saygili
`loadAppState(options)` zaten `skipPersist` opsiyonunu destekliyordu ve migration kalicilastirmasi (`if (!skipPersist && (synced.changed || loyaltyChanged))`) zaten korunuyordu. Eksik olan tek nokta seed yazimiydi.

- `skipPersist: true` iken seed verisi veritabanina YAZILMAZ; hesaplanan baslangic durumu in-memory doner (`{ data, updatedAt: null }`).
- `skipPersist: false` (varsayilan / POST yolu) iken davranis AYNEN korunur (seed + cache yazimi).

### 2. api/state.js - GET salt-okuma
GET dalindaki state okumasi artik persist kapali cagriliyor:

```js
const remote = await runSqlReadFast(() => (
  isFullAdmin
    ? loadAppState({ skipPersist: true })
    : loadAppStateForCustomer(session.customerId, { skipPersist: true })
));
```

`loadAppStateForCustomer` `options`'i legacy fallback'te `loadAppState`'e iletir; relational compose yolu zaten salt-okumadir. Boylece GET'in tum dallarinda yazma yan etkisi kalkar.

### Degismeyenler (kapsam disi, kasitli)
- POST/yazma davranisi: POST'taki canonical okuma ve `runSql(() => saveAppState(...))` yazimlari dokunulmadi.
- Yetkilendirme: admin/musteri yetki akisi, PIN kontrolu, filtreler degismedi.
- Dogum gunu bonusu (`applyBirthdayReward` -> `saveAppState`, GET icinde): Bu ayri ve kasitli bir feature yazimidir (legacy mod, musteri basina bir kez odul verir). Bu hotfix'in kapsami `loadAppState` seed/menu/loyalty kalicilastirmasiydi; dogum gunu yaziminin kaldirilmasi odulun her okumada tekrar verilmesine yol acacagi icin bilincli olarak degistirilmedi.

## Timeout Siniflandirmasi (Dogrulandi - kod degisikligi gerekmedi)
Okuma fail-fast timeout'u zaten transient olarak siniflaniyor:

- `dbTransient.js` -> `runWithAttemptTimeout`, timeout'ta `Error('ETIMEDOUT: sql attempt timeout')` (code `ETIMEDOUT`) firlatir.
- `isTransientDbError` `etimedout` desenini icerir -> `true`.
- `api/state.js` catch: `if (isTransientDbError(err)) return res.status(503)` -> ham 500 degil, kontrollu 503 (`STATE_TEMPORARILY_UNAVAILABLE`).

Bu davranis yeni testle acikca dogrulandi.

## Testler - tests/state-get-side-effect.test.mjs (8 test)
1. GET full-admin legacy yolu `loadAppState({ skipPersist: true })` ile cagrilir (yazma yok).
2. GET musteri yolu da `skipPersist: true` ile cagrilir.
3. `loadAppState` seed dali `skipPersist` modunda `saveAppState` cagirmaz (guard, save'den once; persist'siz doner).
4. Menu/loyalty migration kalicilastirmasi `skipPersist` ile atlanir.
5. GET seed/migrated state hesaplanip kalicilastirilmadan donebilir.
6. POST/state yazimi hala `runSql` ile `saveAppState` cagirir (write degismedi).
7. Read timeout `ETIMEDOUT` olarak transient siniflanir -> kontrollu 503 (davranissal test).
8. GET icinde cift yazma/retry riski yok (`skipPersist` ile saveAppState cagrilmaz).

Ayrica mevcut tests/production-db-stability.test.mjs icindeki, eski GET bicimini (`loadAppState()`) bekleyen assertion, yeni `skipPersist` bicimine guncellendi (davranis kasitli degistigi icin).

## Calistirma Sonuclari
| Komut | Sonuc |
|------|-------|
| npm test | 402 gecti, 0 basarisiz |
| npm run lint | 0 hata, 56 onceden var olan uyari (yeni uyari yok) |
| npm run build | Basarili (exit 0), build sonu testleri 402/402 gecti |

Cikti dosyalari:
- STATE_GET_SIDE_EFFECT_TEST_OUTPUT.txt
- STATE_GET_SIDE_EFFECT_LINT_OUTPUT.txt
- STATE_GET_SIDE_EFFECT_BUILD_OUTPUT.txt

## Etki Ozeti
- GET `/api/state` artik okuma sirasinda app state yazmiyor -> yavas GET ve fail-fast wrapper altindaki cift-yazma/retry riski ortadan kalkti.
- Okuma timeout'u kontrollu 503 donduruyor (ham 500 degil) - dogrulandi.
- POST/yazma ve yetkilendirme davranisi degismedi. Yeni ozellik/migration eklenmedi; deploy/mobil build baslatilmadi.
