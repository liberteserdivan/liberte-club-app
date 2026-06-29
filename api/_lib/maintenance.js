import { pruneExpiredQrNonces } from './qrNonceStore.js';

// B-9: Süresi dolan bakım kayıtlarını temizle. Projede cron olmadığından, bu
// fonksiyon düşük frekanslı yazma yollarında (örn. logout) DÜŞÜK OLASILIKLA ve
// best-effort çağrılır. Amaç tabloların sınırsız büyümesini önlemek.
// Tek iş: süresi geçmiş satırları sil. Hata yutulur (çağıran try/catch yapar).
export async function purgeExpiredAuthData(sql) {
  if (!sql) return;
  // Süresi dolmuş oturumlar (30 gün ömürlü; expires_at geçti)
  await sql`DELETE FROM auth_sessions WHERE expires_at < now()`;
  // Eski rate-limit pencereleri (pencere 15 dk; 1 günden eskisi gereksiz)
  await sql`DELETE FROM auth_rate_limits WHERE window_start < now() - interval '1 day'`;
  // Eski QR nonce kayıtları (token ömrü 90sn)
  await pruneExpiredQrNonces(sql);
}
