import { withSqlRetry } from './dbTransient.js';
import { resetSqlClient } from './sql.js';

// Kritik SQL işlemleri — Supabase pooler kopmasında yeniden dene
export function runSql(task) {
  return withSqlRetry(task, { retries: 3, resetClient: resetSqlClient });
}
