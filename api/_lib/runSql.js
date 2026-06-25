import { withSqlRetry } from './dbTransient.js';
import { resetSqlClient } from './sql.js';

// Kritik SQL işlemleri — kopma olursa yeni bağlantı ile yeniden dene
export function runSql(task) {
  return withSqlRetry(task, { retries: 4, resetClient: resetSqlClient });
}
