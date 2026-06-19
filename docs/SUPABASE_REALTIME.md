# Supabase Realtime — QR / Kasa / LP hazırlık

## Mevcut durum (cutover öncesi)

| Katman | Davranış |
|--------|----------|
| `app_state.data` | Tek kaynak — tüm LP / QR / kasa işlemleri |
| `customer_loyalty` | Tablo hazır, **yazılmıyor** |
| `loyalty_events` | Tablo hazır, **varsayılan kapalı** |
| İstemci sync | HTTP polling (`useCommit` / `syncPolicy`) |

## İleride hedef akış

```
Kasa QR işlemi
  → adminLoyalty.js (app_state optimistic lock)
  → (opsiyonel) recordLoyaltyEvent + bumpCustomerLoyaltyRevision
  → Supabase Realtime: loyalty:{customerId}
  → Müşteri ekranı canlı LP güncellemesi
```

## Ortam değişkeni

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `ENABLE_LOYALTY_EVENT_LOG` | kapalı | `1` olunca `loyalty_events` + `revision` yazılır |

**Not:** `adminLoyalty.js` henüz bu modülü çağırmıyor. Cutover onayı sonrası tek satırlık entegrasyon yeterli.

## Publication (Supabase SQL Editor)

Cutover + RLS tasarımı hazır olunca:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE customer_loyalty;
ALTER PUBLICATION supabase_realtime ADD TABLE loyalty_events;
```

## Realtime abonelik kanalı tasarımı

| Tablo | Kanal önerisi | Olay |
|-------|---------------|------|
| `customer_loyalty` | `loyalty:{customer_id}` | `revision` değişimi → tam state yenile veya delta |
| `loyalty_events` | `loyalty-events:{customer_id}` | Son işlem toast / animasyon |

## Güvenlik notu

Supabase Auth **kullanılmıyor**. Realtime client bağlanırsa:

- RLS ile `customer_id = session.customerId` kuralı gerekir, **veya**
- Vercel üzerinden kısa ömürlü Realtime JWT üretimi, **veya**
- Yalnızca sunucu tarafı yazım + istemci polling (mevcut) devam eder.

İlk aşamada **polling korunur**; Realtime isteğe bağlı hızlandırma katmanıdır.

## Supabase JS client (ileride)

Şu an **zorunlu değil**. Gerekirse:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Yalnızca Realtime client için; PostgreSQL bağlantısı `DATABASE_URL` ile devam eder.
