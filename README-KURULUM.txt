Liberte Club v9 - Resend Mail Onaylı Giriş

Yükleme:
1) ZIP'i çıkar.
2) İçindeki tüm dosyaları GitHub liberte-club-app reposuna yükle.
3) package-lock.json yükleme.
4) Commit changes de. Vercel otomatik deploy eder.

Vercel Environment Variables:
DATABASE_URL = Neon connection string (zaten var)
RESEND_API_KEY = Resend API key
RESEND_FROM_EMAIL = Liberte Club <noreply@liberte.cafe>

Not:
Resend domain doğrulanmadan tüm müşterilere mail göndermek sınırlı olabilir. Gerçek kullanım için Resend'de liberte.cafe domainini doğrula ve DNS kayıtlarını İsimtescil'e ekle.
