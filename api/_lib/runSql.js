import { withSqlRetry } from './dbTransient.js';
import { isSqlRequestActive, resetSqlClient } from './sql.js';
import { ROUTE_TIMING } from './routeTiming.js';

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
const SESSION_READ_ATTEMPT_TIMEOUT_MS = 3000;
export function runSqlReadFast(task) {
  const retries = isSqlRequestActive() ? 1 : 2;
  return withSqlRetry(task, {
    retries,
    resetClient: resetSqlClient,
    attemptTimeoutMs: SESSION_READ_ATTEMPT_TIMEOUT_MS
  });
}

// Admin üye listesi — daha uzun okuma penceresi; loyalty map büyük olabilir
export function runSqlAdminMembersRead(task) {
  const retries = isSqlRequestActive() ? 2 : 3;
  return withSqlRetry(task, {
    retries,
    resetClient: resetSqlClient,
    attemptTimeoutMs: ROUTE_TIMING.ADMIN_MEMBERS_READ_MS
  });
}

// Login kimlik doğrulama okumaları — tek deneme, route deadline içinde kontrollü timeout
export function getLoginReadAttemptTimeoutMs() {
  return ROUTE_TIMING.LOGIN_READ_ATTEMPT_MS;
}

export function runSqlLoginRead(task) {
  return withSqlRetry(task, {
    retries: 1,
    resetClient: resetSqlClient,
    attemptTimeoutMs: getLoginReadAttemptTimeoutMs()
  });
}

// Çıkışta oturum silme — tek deneme, kısa timeout (hemen ardından login yarışmasını önler)
export function runSqlSessionDelete(task) {
  return withSqlRetry(task, {
    retries: 0,
    resetClient: resetSqlClient,
    attemptTimeoutMs: 3000
  });
}
