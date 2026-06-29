import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import { describeDatabaseUrl, logDatabaseConnectionOnce } from './dbConnection.js';

// Production'da Neon bağlantısını reddet
function assertProductionDatabaseAllowed(connectionString) {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (env !== 'production') return true;

  const info = describeDatabaseUrl(connectionString);
  if (info.provider === 'neon') {
    console.error('[db.connection] BLOCKED', JSON.stringify({
      provider: info.provider,
      hostMasked: info.hostMasked,
      port: info.port,
      env,
      reason: 'neon_not_allowed_in_production'
    }));
    return false;
  }

  return true;
}

function isTransactionPooler(connectionString) {
  const url = String(connectionString || '');
  return /:6543(\/|\?|$)/.test(url) || /pooler\.supabase\.com/i.test(url);
}

// RB-4: Her SQL statement'i DB tarafında üst sınırla. Bayat/asılı bağlantıda
// tek bir sorgu, fonksiyonun maxDuration'ına (60sn) kadar asılı kalmasın.
// Tam-state yazımı gibi transaction DIŞI yollar da bu global timeout ile korunur;
// transaction içindeki "SET LOCAL statement_timeout" bunu daha da düşürebilir.
// Değer, 8sn'lik transaction timeout'larının üstünde ama 60sn limitinin altında.
const STATEMENT_TIMEOUT_MS = 25000;

// Vercel + Supabase pooler için bağlantı seçenekleri
function buildClientOptions(connectionString) {
  const transactionPooler = isTransactionPooler(connectionString);
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60,
    // Bağlantı başına global statement_timeout (donma koruması)
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS }
  };

  if (transactionPooler) {
    // Pooler (PgBouncer transaction mode) — prepared statement kapalı
    options.prepare = false;
    options.fetch_types = false;
    // Aynı instance'ta eşzamanlı isteklerin tek bağlantıda sıraya girmemesi için
    options.max = 3;
    options.idle_timeout = 20;
    options.max_lifetime = 60;
    // Bağlantı koparsa postgres.js sorgu sırasında otomatik yeniden bağlanır
    options.connection = {
      application_name: 'liberte-club',
      statement_timeout: STATEMENT_TIMEOUT_MS
    };
  }

  return options;
}

function resolveConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!assertProductionDatabaseAllowed(connectionString)) return null;
  return connectionString;
}

function createSqlClient(connectionString) {
  logDatabaseConnectionOnce(connectionString);
  return postgres(connectionString, buildClientOptions(connectionString));
}

// İstek kapsamı — handler içinde getSql aynı istemciyi döndürür
const requestStorage = new AsyncLocalStorage();

// Tek, kararlı istemci — instance ömrü boyunca yeniden kullanılır.
// postgres.js kopan bağlantıyı sorgu anında otomatik yeniler, bu yüzden
// istemci ASLA istek içinde kapatılmaz (eşzamanlı istekleri korur).
let sharedSql = null;
let sharedConnectionString = '';

// Paylaşılan istemciyi getir veya oluştur
function getOrCreateSharedSql(connectionString) {
  if (!sharedSql || sharedConnectionString !== connectionString) {
    sharedSql = createSqlClient(connectionString);
    sharedConnectionString = connectionString;
  }
  return sharedSql;
}

// Bağlantıyı sıfırla — bayat (pooler tarafından kapatılmış) istemciyi bırakır.
// Eski istemciyi ZORLA kapatmaz: eşzamanlı isteklerin in-flight sorgularını
// koparmamak için referansı düşürür; eski bağlantı kendi idle_timeout/max_lifetime
// ile kapanır. Bir sonraki getSql taze bir istemci (yeni bağlantı) oluşturur.
export function resetSqlClient() {
  sharedSql = null;
  sharedConnectionString = '';
  // Aktif istek kapsamındaki bağlamayı da temizle ki retry taze istemci alsın
  const holder = requestStorage.getStore();
  if (holder) holder.sql = null;
}

// Aktif SQL istemcisi — istek kapsamı ile paylaşılan istemci aynıdır.
// Kapsam bağlaması temizlenmişse (reset sonrası) yeniden taze istemciye bağlanır.
export function getSql() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  const holder = requestStorage.getStore();
  if (holder?.sql) return holder.sql;

  const sql = getOrCreateSharedSql(connectionString);
  if (holder) holder.sql = sql;
  return sql;
}

// Bağlantı canlı mı — sağlık kontrolü için
export async function pingSql(sql) {
  if (!sql) return false;
  try {
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}

// Login gibi gecikmeye duyarlı akışlardan ÖNCE bağlantıyı tazele.
// Bayat (pooler'ın kapattığı) bağlantı, asıl sorgu anında saniyelerce stall
// edebilir. Kısa SELECT 1 ile önden yokla; başarısız/timeout olursa istemciyi
// sıfırla (sonraki getSql taze bağlantı açar). Yan etkisiz, salt-okunur.
export async function primeSqlConnection(timeoutMs = 2500, sqlOverride = null) {
  const sql = sqlOverride || getSql();
  if (!sql) return false;
  const ping = sql`SELECT 1 AS ok`.then(() => true).catch(() => false);
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(false), timeoutMs); });
  const ok = await Promise.race([ping, timeout]);
  if (!ok) resetSqlClient();
  return ok;
}

// İstek kapsamında mıyız — iç içe retry gereksiz
export function isSqlRequestActive() {
  return Boolean(requestStorage.getStore());
}

// API handler — paylaşılan istemciyi istek kapsamına bağla (ping/kapatma yok)
export async function runHandlerWithSql(handler) {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    return handler();
  }

  const holder = { sql: getOrCreateSharedSql(connectionString) };
  return requestStorage.run(holder, handler);
}
