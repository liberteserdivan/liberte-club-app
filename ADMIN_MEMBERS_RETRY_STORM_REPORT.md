# /api/admin/members RETRY STORM RAPORU

Tarih: 2026-06-29
Sorun: admin-members artık 500 değil 503 dönüyor (iyi) ama çok sık (4× üst üste) ve bazen 19.6sn.

## Bulgular

1. **19.6sn süre:** Sunucu tarafında **ardışık** fail-fast okumalar yığılıyordu:
   - admin doğrulama (`requireAdminSession` → `findCustomerById`) — `runSqlRead` (yavaş, ~6sn)
   - `listAllCustomers` — `runSqlReadFast` (~6sn)
   - `loadLoyaltyMapFromSql` — `runSqlReadFast` (~6sn)
   Toplam ~18sn. **Çözüm:** admin doğrulama okuması da `runSqlReadFast`'e çevrildi (`api/_lib/auth.js`).

2. **4× eşzamanlı çağrı:** İstemcide `useAdminMembers` birden çok tetikleyiciden (poll 60sn + tab aktif + customersChanged + admin hydrate) **paralel** `pullMembers` başlatabiliyordu. Dedup yoktu.

3. **503 sonrası tekrar tekrar deneme:** Circuit breaker uygulanmıyordu.

## Düzeltme (istemci)

`src/hooks/useAdminMembers.js`:
- **In-flight dedup:** `inFlightRef` — uçuşta istek varsa yeni istek aynı promise'i paylaşır (aynı anda 2. istek başlamaz).
- **Circuit breaker:** `backgroundCircuit.js` (`admin-members` anahtarı) — 3 ardışık hata sonrası 60sn boyunca arka plan denemesi atlanır. Manuel yenileme (`manual:true`) devreyi baypas eder.
- `recordSuccess` / `recordFailure` ile devre yönetimi.

`src/lib/adminMemberClient.js`:
- `fetchAdminMembersList` timeout 60000ms → 12000ms (sunucu fail-fast olduğundan UI uzun asılı kalmaz).

## Kabul testleri

- `useAdminMembers: in-flight dedup + circuit breaker entegre` ✅
- `adminMemberClient: client timeout 60sn yerine kısaltıldı` ✅
- `backgroundCircuit: admin-members 3 hata sonrası 60sn skip eder` (davranışsal) ✅

## Beklenen sonuç

- Admin members pending iken ikinci istek başlamaz (dedup).
- 503 sonrası 60sn boyunca arka planda tekrar tekrar denenmez (circuit).
- Süre üst sınırı düştü: admin doğrulama + tek customers okuması ile worst-case ~12sn yerine yığılma azaldı; DB sağlıklıyken <5sn.

## Not — kalıcı çözüm

Asıl 503 nedeni DB erişilebilirliğidir (bkz. `PRODUCTION_DB_ROOT_CAUSE_REPORT.md`). DB sağlıklı olduğunda bu endpoint hızlı 200 dönecektir; bu rapordaki değişiklikler DB bozukken **istemci selini** ve **süreyi** sınırlar.
