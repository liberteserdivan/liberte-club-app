Liberte Club v4 - Kalıcı Veritabanı Sürümü

1) Bu klasördeki dosyaları GitHub'daki liberte-club-app reposuna yükle.
2) package-lock.json yükleme.
3) Vercel otomatik deploy edecek.
4) Neon'da ücretsiz PostgreSQL veritabanı aç.
5) Neon connection string'i kopyala.
6) Vercel > Project > Settings > Environment Variables bölümüne ekle:
   Name: DATABASE_URL
   Value: Neon connection string
7) Vercel'de Redeploy yap.

Test:
- Uygulamada üstte "Bulut kayıt" yazarsa veriler Neon'a kaydoluyor.
- "Yerel kayıt" yazarsa DATABASE_URL eksik veya bağlantı yok.
