import postgres from 'postgres';
import { describeDatabaseUrl, logDatabaseConnectionOnce } from './dbConnection.js';

// Production'da Neon bağlantısını reddet — yanlış env ile eski DB'ye yazımı engelle
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

// Supabase transaction pooler (6543) prepared statement desteklemez
function isTransactionPooler(connectionString) {
  const url = String(connectionString || '');
  return /:6543(\/|\?|$)/.test(url) || /pooler\.supabase\.com/i.test(url);
}

// Vercel serverless için Postgres bağlantı seçenekleri
function buildClientOptions(connectionString) {
  const transactionPooler = isTransactionPooler(connectionString);
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    max_lifetime: 60 * 30
  };

  if (transactionPooler) {
    // Supabase transaction pooler — serverless uyumu
    options.prepare = false;
    options.fetch_types = false;
    options.idle_timeout = 5;
    options.max_lifetime = 120;
  }

  return options;
}

const GLOBAL_SQL_KEY = '__libertePostgresSql';

let cachedSql = null;
let cachedConnectionString = '';

// Kopmuş pooler bağlantısını temizle
export function resetSqlClient() {
  const previous = cachedSql;
  cachedSql = null;
  cachedConnectionString = '';
  delete globalThis[GLOBAL_SQL_KEY];

  if (previous && typeof previous.end === 'function') {
    previous.end({ timeout: 0 }).catch(() => {});
  }
}

// Ortak SQL istemcisi — warm serverless instance içinde tek pool yeniden kullanılır
export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!assertProductionDatabaseAllowed(connectionString)) return null;

  logDatabaseConnectionOnce(connectionString);

  const globalCache = globalThis[GLOBAL_SQL_KEY];
  if (globalCache?.connectionString === connectionString && globalCache?.client) {
    return globalCache.client;
  }

  if (cachedSql && cachedConnectionString === connectionString) {
    return cachedSql;
  }

  cachedConnectionString = connectionString;
  cachedSql = postgres(connectionString, buildClientOptions(connectionString));
  globalThis[GLOBAL_SQL_KEY] = { connectionString, client: cachedSql };
  return cachedSql;
}
