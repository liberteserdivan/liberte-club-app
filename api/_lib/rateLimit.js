import { neon } from '@neondatabase/serverless';

const WINDOW_MS = 15 * 60 * 1000;

// Rate limit tablosunu hazırla
async function ensureRateLimitTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    rate_key text PRIMARY KEY,
    hit_count int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
  )`;
}

// SQL bağlantısı
function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return neon(connectionString);
}

// İstek IP adresini oku
export function readClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

// Rate limit kontrolü — aşıldıysa true döner
export async function isRateLimited(key, { maxHits = 10, windowMs = WINDOW_MS } = {}) {
  const sql = getSql();
  if (!sql || !key) return false;

  await ensureRateLimitTable(sql);
  const rows = await sql`
    SELECT hit_count, window_start
    FROM auth_rate_limits
    WHERE rate_key = ${key}
    LIMIT 1
  `;

  const row = rows[0];
  const now = Date.now();

  if (!row) {
    await sql`
      INSERT INTO auth_rate_limits (rate_key, hit_count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (rate_key) DO UPDATE SET
        hit_count = 1,
        window_start = now()
    `;
    return false;
  }

  const windowStart = new Date(row.window_start).getTime();
  if (now - windowStart > windowMs) {
    await sql`
      UPDATE auth_rate_limits
      SET hit_count = 1, window_start = now()
      WHERE rate_key = ${key}
    `;
    return false;
  }

  if (Number(row.hit_count) >= maxHits) {
    return true;
  }

  await sql`
    UPDATE auth_rate_limits
    SET hit_count = hit_count + 1
    WHERE rate_key = ${key}
  `;
  return false;
}

// Auth uçları için IP + eylem anahtarı
export async function enforceAuthRateLimit(req, action, { maxHits = 10 } = {}) {
  const ip = readClientIp(req);
  const limited = await isRateLimited(`${action}:${ip}`, { maxHits });
  return limited;
}
