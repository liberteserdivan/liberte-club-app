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

// Oturum/auth bootstrap okumaları — tek katman, ~3.6sn üst sınır (4sn hedef).
// authSession.js içinde İKİNCİ withSqlRetry sarmalayıcı KULLANILMAMALI (10sn+ yapar).
const SESSION_BOOTSTRAP_ATTEMPT_TIMEOUT_MS = 1800;
export function runSqlSessionBootstrap(task) {
  return withSqlRetry(task, {
    retries: 1,
    resetClient: resetSqlClient,
    attemptTimeoutMs: SESSION_BOOTSTRAP_ATTEMPT_TIMEOUT_MS
  });
}

// Oturum/auth doğrulama okumaları için FAIL-FAST varyant.
// Auth kontrolü ucuz ve indeksli bir lookup'tır; bayat bağlantıda 4x6sn (~30sn)
// retry yığını oturum bağımlı uçların (ör. yetkisiz /api/state) 30sn+ asılı
// kalıp 401 dönmesine yol açıyordu. Daha kısa timeout + az deneme ile en kötü
// durumda hızlı 401 döner; sağlıklı bağlantıda zaten <1sn'dir.
const SESSION_READ_ATTEMPT_TIMEOUT_MS = 3000;
export function runSqlReadFast(task) {
  const retries = isSqlRequestActive() ? 1 : 2;
  return withSqlRetry(task, {
    retries,
    resetClient: resetSqlClient,
    attemptTimeoutMs: SESSION_READ_ATTEMPT_TIMEOUT_MS
  });
}
