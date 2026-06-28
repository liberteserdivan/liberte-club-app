import { applyCors, readBodySafe } from '../http.js';
import { requireSession } from '../auth.js';
import { applyDailyLoginRewardRelational } from '../customerRewards.js';
import { logServerError } from '../logServerError.js';
import { runSql } from '../runSql.js';
import { publicDbErrorCode, publicDbErrorMessage, isUndefinedTableError } from '../dbTransient.js';
import { recordIncident } from '../guardian/guardianIncidents.js';

// daily_claims tablosu eksikse Guardian'a tek seferlik (dedup'lı) incident düş.
// Admin panelde "migration eksik" uyarısını görür; ham DB hatası kullanıcıya gitmez.
function reportDailyClaimsTableMissing() {
  recordIncident({
    level: 'incident',
    title: 'daily_claims tablosu eksik olabilir',
    affectedArea: 'loyalty.daily-claim',
    symptoms: ['Günlük LP claim isteği tablo bulunamadığı için başarısız oluyor.'],
    suspectedRootCauses: ['daily_claims tablosu/sütunları üretimde mevcut değil (migration uygulanmamış).'],
    relatedFiles: ['scripts/sql/001_normalized_schema.sql', 'scripts/sql/005_daily_claims_dedup.sql'],
    recommendedAction: 'daily_claims migration dosyalarını üretim veritabanına uygulayın (001 + 005). Otomatik çalıştırma yapılmaz.'
  });
}

// Günlük giriş LP ödülü — sunucuda kalıcı
export async function handleDailyLoginClaim(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session?.customerId) return;

  try {
    readBodySafe(req);
    const result = await runSql(() => applyDailyLoginRewardRelational(session.customerId));

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'Ödül alınamadı' });
    }

    return res.status(200).json({
      ok: true,
      message: result.message,
      loyalty: result.loyalty,
      dailyClaims: result.dailyClaims
    });
  } catch (error) {
    await logServerError({
      source: 'loyalty.daily-claim',
      error,
      customerId: session.customerId
    });

    // Tablo eksik → 503 + net kod; ham "relation does not exist" sızdırılmaz.
    if (isUndefinedTableError(error)) {
      try { reportDailyClaimsTableMissing(); } catch { /* incident kaydı best-effort */ }
      return res.status(503).json({
        ok: false,
        code: 'DAILY_CLAIMS_TABLE_MISSING',
        error: 'Günlük ödül sistemi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
      });
    }

    return res.status(500).json({
      ok: false,
      error: publicDbErrorMessage(error, 'Günlük ödül kaydedilemedi'),
      code: publicDbErrorCode(error, 'DAILY_CLAIM_FAILED')
    });
  }
}
