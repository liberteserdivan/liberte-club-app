import { withSqlRetry } from './dbTransient.js';
import { isSqlRequestActive, resetSqlClient } from './sql.js';

// Kritik SQL — API isteği içindeyken tek retry katmanı yeterli
export function runSql(task) {
  if (isSqlRequestActive()) {
    return task();
  }
  return withSqlRetry(task, { retries: 4, resetClient: resetSqlClient });
}
