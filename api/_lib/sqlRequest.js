import { runHandlerWithSql } from './sql.js';

// Vercel serverless — warm DB bağlantısı + yakalanmamış hata koruması
export function withSqlRequest(handler) {
  return async function sqlRequestHandler(req, res) {
    try {
      await runHandlerWithSql(() => handler(req, res));
    } catch (error) {
      console.error('[api.sql]', req.url || '', error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          code: 'SERVER_ERROR',
          message: 'Sunucu geçici olarak yanıt veremedi. Lütfen tekrar deneyin.'
        });
      }
    }
  };
}
