import { runHandlerWithSql } from './sql.js';
import { isTransientDbError } from './dbTransient.js';

// API girişi — paylaşılan DB istemcisini istek kapsamına bağlar ve
// yakalanmamış hatalara karşı son güvenlik ağı sağlar.
export function withSqlRequest(handler) {
  return async function sqlRequestHandler(req, res) {
    try {
      await runHandlerWithSql(() => handler(req, res));
    } catch (error) {
      console.error('[api.sql]', req.url || '', error?.message || error);
      if (res.headersSent) return;

      // Geçici DB hatasında 503 + tekrar denenebilir kod döndür
      const transient = isTransientDbError(error);
      res.status(transient ? 503 : 500).json({
        ok: false,
        code: transient ? 'DATABASE_TRANSIENT' : 'SERVER_ERROR',
        message: 'Sunucu geçici olarak yanıt veremedi. Lütfen tekrar deneyin.'
      });
    }
  };
}
