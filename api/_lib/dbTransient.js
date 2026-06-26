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

// Kopan bağlantıda isteği kısa gecikmeyle yeniden dene
export async function withSqlRetry(task, { retries = 4, resetClient } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
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
