// Geçici veritabanı hatalarını tanı — Supabase pooler / serverless

const TRANSIENT_PATTERNS = [
  'connection_closed',
  'edbhandlerexited',
  'connection to database closed',
  'connection terminated',
  'connection terminated unexpectedly',
  'econnreset',
  'socket hang up',
  'socket has been ended by the other party',
  'socket has been ended',
  'epipe',
  'etimedout',
  'econnrefused',
  'connection reset by peer',
  'broken pipe',
  'client_idle_timeout',
  'canceling statement due to statement timeout',
  'too many connections',
  '57p01',
  '08006',
  '08003',
  '08001',
  'nodename nor servname'
];

// Pooler veya ağ kaynaklı geçici hata mı?
export function isTransientDbError(error) {
  const text = String(error?.message || error?.code || error || '').toLowerCase();
  return TRANSIENT_PATTERNS.some((part) => text.includes(part));
}

// Tablo/ilişki mevcut değil mi? (Postgres 42P01 — migration uygulanmamış olabilir.)
// Geçici değildir; retry ile düzelmez, açık bir migration uyarısı gerektirir.
export function isUndefinedTableError(error) {
  if (String(error?.code || '') === '42P01') return true;
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('does not exist') && text.includes('relation');
}

// İstemciye ham DB metni sızdırma
export function publicDbErrorMessage(error, fallback = 'İşlem tamamlanamadı. Lütfen tekrar dene.') {
  if (isTransientDbError(error)) {
    return 'Sunucu geçici olarak yanıt veremedi. Birkaç saniye sonra tekrar deneyin.';
  }

  const msg = String(error?.message || error || '').trim();
  if (!msg) return fallback;

  const looksInternal = /postgres|supabase|pooler|database|connection|sql|neon\.tech/i.test(msg);
  if (looksInternal) return fallback;

  return msg.length > 160 ? fallback : msg;
}

// Geçici DB hatası için API kodu
export function publicDbErrorCode(error, fallback = 'SERVER_ERROR') {
  return isTransientDbError(error) ? 'DATABASE_TRANSIENT' : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Görevi zaman sınırıyla yarıştır — bayat bağlantıda postgres.js'in TCP
// zaman aşımını (~15sn) beklemek yerine erken vazgeçip yeniden bağlanmayı sağlar.
// timeoutMs <= 0 ise sınır uygulanmaz (varsayılan davranış korunur).
function runWithAttemptTimeout(task, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return Promise.resolve().then(task);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Mesaj 'etimedout' içerir ki isTransientDbError geçici sayıp retry tetiklesin
      const err = new Error('ETIMEDOUT: sql attempt timeout');
      err.code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);

    Promise.resolve()
      .then(task)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

// Kopan/bayat bağlantıda isteği kısa gecikmeyle yeniden dene.
// attemptTimeoutMs verilirse her deneme bu süreyle sınırlanır (stall koruması).
export async function withSqlRetry(task, { retries = 4, resetClient, attemptTimeoutMs = 0 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await runWithAttemptTimeout(task, attemptTimeoutMs);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= retries) {
        throw error;
      }
      if (typeof resetClient === 'function') {
        await Promise.resolve(resetClient());
      }
      await sleep(60 * (attempt + 1));
    }
  }

  throw lastError;
}
