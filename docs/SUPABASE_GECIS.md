# Neon → Supabase (ücretsiz geçiş)

Neon ağ kotası dolduğunda veri **dışarı aktarılamaz**. Bu rehber: **yeni boş veritabanı** ile uygulamayı tekrar ayağa kaldırır.

## Önemli — eski veri

| Durum | Sonuç |
|--------|--------|
| Eski Neon (`liberte-club-db`) | Kota bitene kadar `pg_dump` / API yedek **yok** |
| Snapshot (Neon içi) | Bilgisayarına inmez; kota açılmadan kullanılamaz |
| Önbellek JSON (1 üye) | Kısmi; tüm müşterileri içermez |

**Ücretsiz ve beklemeden** yapılabilecekler: yeni DB + mümkün olan yedek + üyelerin yeniden kayıt / PIN sıfırlama.

---

## 1. Supabase projesi oluştur

1. [supabase.com](https://supabase.com) → **Start your project** (GitHub ile giriş).
2. **New project**
   - İsim: `liberte-club`
   - Şifre: güçlü bir DB şifresi (kaydet)
   - Bölge: **Frankfurt (eu-central-1)**
3. Proje hazır olunca **Project Settings** → **Database** → **Connection string**.

### Vercel için doğru string

**Connection pooling** → **Transaction** modu → **URI** kopyala:

```text
postgresql://postgres.xxxxx:ŞİFRE@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Bu adresi Vercel’de `DATABASE_URL` olarak kullan.

---

## 2. Vercel ortam değişkeni

1. Vercel → proje → **Settings** → **Environment Variables**
2. `DATABASE_URL` → **Edit** → Supabase URI yapıştır
3. **Production** + **Preview** kaydet
4. **Deployments** → son deploy → **Redeploy**

---

## 3. Şema (ilk açılış)

Uygulama ilk API isteğinde tabloları kendisi oluşturur (`CREATE TABLE IF NOT EXISTS`).

İstersen yerelde önce şemayı kur:

```powershell
$env:DATABASE_URL = "postgresql://..."   # Supabase transaction URI
npm run db:init
```

---

## 4. Kısmi yedek varsa içe aktar

```powershell
$env:TARGET_DATABASE_URL = "postgresql://..."   # aynı Supabase URI
npm run neon:import -- "C:\yol\liberte-onbellek-yedek-....json"
```

**Uyarı:** Bu dosya tüm üyeleri silip yedekteki veriyi yazar. Tam sunucu yedeği değilse kullanma.

---

## 5. Test

1. https://app.libertegastrocafe.com → admin giriş
2. Yeni üye kaydı dene
3. Kasa PIN / sadakat işlemi

---

## Supabase Free limitleri (yaklaşık)

| Kaynak | Limit |
|--------|--------|
| Veritabanı | 500 MB |
| Bant genişliği | Aylık kota (projene göre panelde görünür) |

Liberte (~40 MB depolama Neon’da) için Free yeterlidir.

---

## Eski Neon

- Projeyi silmek zorunda değilsin; snapshot içeride kalır.
- İleride kota sıfırlanırsa veya ücretli açarsan `pg_dump` alıp Supabase’e `psql -f` ile aktarabilirsin.
