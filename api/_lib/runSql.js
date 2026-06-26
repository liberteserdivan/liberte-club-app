import { withSqlRetry } from './dbTransient.js';
import { isSqlRequestActive, resetSqlClient } from './sql.js';

// Kritik SQL — kopan bağlantıda sorguyu yeniden dener.
// İstek kapsamında daha az deneme (iç içe retry storm önlenir);
// kapsam dışında (script/dev) daha fazla deneme.
export function runSql(task) {
  const retries = isSqlRequestActive() ? 2 : 4;
  return withSqlRetry(task, { retries, resetClient: resetSqlClient });
}
