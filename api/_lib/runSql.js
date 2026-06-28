import { withSqlRetry } from './dbTransient.js';
import { isSqlRequestActive, resetSqlClient } from './sql.js';

// Read uçları için bayat bağlantıda her deneme bu süreyle sınırlanır.
// Postgres.js'in ~15sn TCP zaman aşımını beklemek yerine erken vazgeçip
// yeniden bağlanmayı sağlar. Yalnızca READ-ONLY işlerde kullanılmalıdır.
const READ_ATTEMPT_TIMEOUT_MS = 6000;

// Kritik SQL (WRITE/mutation) — kopan bağlantıda sorguyu yeniden dener.
// DİKKAT: Burada attemptTimeoutMs YOK. Mutasyonu körlemesine zaman aşımı ile
// yarıştırmak, geç commit eden eski promise + retry sonucu ÇİFT yazma riski
// doğurur. Yazma stall'ları transaction içindeki statement_timeout ile sınırlanır.
// İstek kapsamında daha az deneme (iç içe retry storm önlenir).
export function runSql(task) {
  const retries = isSqlRequestActive() ? 2 : 4;
  return withSqlRetry(task, { retries, resetClient: resetSqlClient });
}

// READ-ONLY SQL — bayat bağlantıda her deneme attemptTimeoutMs ile sınırlanır.
// Yan etkisi olmadığı için erken vazgeçip yeniden denemek güvenlidir.
export function runSqlRead(task) {
  const retries = isSqlRequestActive() ? 2 : 4;
  return withSqlRetry(task, {
    retries,
    resetClient: resetSqlClient,
    attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS
  });
}
