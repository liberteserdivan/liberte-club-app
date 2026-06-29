import { getSql } from './appState.js';
import { ensureSchemaReady } from './schemaReady.js';
import { runSql } from './runSql.js';

// Rate limit penceresi (15 dakika)
const WINDOW_MS = 15 * 60 * 1000;

// Rate limit tablosunu hazırla
async function ensureRateLimitTable(sql) {
  await ensureSchemaReady(sql);
}

// İstek IP adresini oku
export function readClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

// Rate limit kontrolü — aşıldıysa true döner.
// B-4: SELECT->UPDATE yarış koşulu giderildi. Tek atomik INSERT ... ON CONFLICT
// ile pencere sıfırlama + sayaç artışı aynı ifadede yapılır; eşzamanlı isteklerde
// sayaç gerçek istek sayısını yansıtır (brute-force koruması zayıflamaz).
async function isRateLimitedCore(key, { maxHits = 10, windowMs = WINDOW_MS } = {}) {
  const sql = getSql();
  if (!sql || !key) return false;

  await ensureRateLimitTable(sql);
  const rows = await sql`
    INSERT INTO auth_rate_limits (rate_key, hit_count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (rate_key) DO UPDATE SET
      hit_count = CASE
        WHEN now() - auth_rate_limits.window_start > ${windowMs} * interval '1 millisecond'
          THEN 1
        ELSE auth_rate_limits.hit_count + 1
      END,
      window_start = CASE
        WHEN now() - auth_rate_limits.window_start > ${windowMs} * interval '1 millisecond'
          THEN now()
        ELSE auth_rate_limits.window_start
      END
    RETURNING hit_count
  `;

  // Atomik artıştan sonra sayaç maxHits'i aşıyorsa engelle (önceki davranışla
  // tutarlı: maxHits adet istek serbest, sonraki engellenir).
  return Number(rows[0]?.hit_count || 0) > maxHits;
}

export async function isRateLimited(key, options = {}) {
  return runSql(() => isRateLimitedCore(key, options));
}

// Auth uçları için rate-limit kontrolü.
// B-3: Anahtar varsayılan olarak IP'dir; ancak `identifier` verilirse (örn. telefon)
// anahtar kimlik bazlı olur. Kafe gibi paylaşımlı IP'lerde, bir IP'ye bağlı tüm
// müşterilerin tek havuzda kilitlenmesini önlemek için login'de telefon bazlı
// (hesap başına) limit kullanılır; ayrıca gevşek bir IP limiti üst sınır görevi görür.
export async function enforceAuthRateLimit(req, action, { maxHits = 10, identifier = '' } = {}) {
  const id = String(identifier || '').trim();
  const key = id ? `${action}:id:${id}` : `${action}:${readClientIp(req)}`;
  const limited = await isRateLimited(key, { maxHits });
  return limited;
}
