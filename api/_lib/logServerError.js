import { insertErrorLog } from './errorLogs.js';

// Sunucu tarafı hataları veritabanına yaz
export async function logServerError({
  source = 'api',
  error,
  customerId = null,
  detail = null,
  level = 'error'
}) {
  try {
    await insertErrorLog({
      level,
      source,
      message: error?.message || String(error || 'Sunucu hatası'),
      detail,
      customerId
    });
  } catch {
    // Log yazılamazsa isteği bozma
  }
}
