# Neon — yeni projeye taşıma (Free limit sonrası)

## Yöntem A — Uygulamadan yedek (önerilen)

### Yedek al

1. **https://app.libertegastrocafe.com** aç (veya yüklü mobil uygulama)
2. Yönetici hesabıyla giriş + **kasa PIN**
3. **Yönetim** → **Ayarlar** sekmesi
4. **Veri yedeği & geri yükleme** bölümü:
   - **Sunucudan indir** — DB açıksa tam sunucu yedeği (`liberte-yedek-....json`)
   - **Önbellekten indir** — Neon kapalıysa, cihazdaki son senkron veri (`liberte-onbellek-yedek-....json`)

Dosyayı güvenli yere kaydet (Google Drive, bilgisayar).

**Önemli:** Uygulama yedeğinde müşteri/sadakat/menü verisi vardır; **PIN hash’leri yoktur**. Yeni DB’de üyeler **PIN sıfırlama** ile yeni PIN belirleyebilir.

### Yeni projeye yükle

```env
TARGET_DATABASE_URL=postgresql://...yeni_neon...
```

```powershell
npm run neon:import -- C:\yol\liberte-yedek-XXXX.json
```

Sonra Vercel `DATABASE_URL` güncelle + redeploy.

---

## Yöntem B — Neon script (DB açıkken)


Proje **duraklatıldıysa** doğrudan bağlantı çalışmaz. Seçenekler:

- **A)** Neon → **Güncelleme** → Launch (birkaç saat) → yedek al → istersen sonra yine Free’ye dönemezsin aynı ay içinde kota için
- **B)** Faturalama dönemi bitene kadar bekle → yedek al

## 2. Yedek al

Vercel’den eski connection string’i kopyala (Settings → Environment Variables → `DATABASE_URL`).

`.env` dosyasına ekle (commit etme):

```env
SOURCE_DATABASE_URL=postgresql://...eski-liberte-club-db...
```

```powershell
npm run neon:export
```

Çıktı: `backups/neon-export-<tarih>.json` (gitignore)

## 3. Yeni Neon projesi

1. [console.neon.tech](https://console.neon.tech) → **New project**
2. İsim örn. `liberte-club-db-v2`, bölge **Frankfurt** (eu-central-1)
3. **Connection string** kopyala

## 4. Yedeği yeni projeye yükle

```env
TARGET_DATABASE_URL=postgresql://...yeni-proje...
```

```powershell
npm run neon:import -- backups/neon-export-XXXX.json
```

## 5. Vercel güncelle

1. Vercel → proje → **Settings** → **Environment Variables**
2. `DATABASE_URL` → **yeni** connection string (Production + Preview)
3. **Deployments** → son deploy → **Redeploy**

## 6. Doğrula

- `https://app.libertegastrocafe.com` → giriş / QR / admin PIN
- Neon yeni projede Usage → ağ aktarımı düşük kalmalı (güncel client: 60 sn sync, `?since=`)

## Notlar

- Oturumlar (`auth_sessions`) yedekte var ama import edilmez — kullanıcılar yeniden giriş yapar.
- Yedek dosyasını güvenli yerde sakla; repoya commit etme.
- Eski proje silinmeden önce yedeğin doğruluğunu kontrol et.
