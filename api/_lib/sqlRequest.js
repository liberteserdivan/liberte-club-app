import { runHandlerWithSql } from './sql.js';

// Vercel serverless — her API isteğinde taze DB bağlantısı
export function withSqlRequest(handler) {
  return (req, res) => runHandlerWithSql(() => handler(req, res));
}
