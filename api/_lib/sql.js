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

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL);
}

// Vercel + Supabase pooler için bağlantı seçenekleri
function buildClientOptions(connectionString) {
  const transactionPooler = isTransactionPooler(connectionString);
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 10,
    connect_timeout: 12,
    max_lifetime: 60
  };

  if (transactionPooler) {
    options.prepare = false;
    options.fetch_types = false;
    options.idle_timeout = 2;
    options.max_lifetime = 55;
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

// İstek kapsamı — her HTTP çağrısında tek bağlantı
const requestStorage = new AsyncLocalStorage();

// Yerel geliştirme / script yedek önbelleği
let devCachedSql = null;
let devCachedConnectionString = '';

// Kopmuş istemciyi kapat
async function endSqlClient(client) {
  if (!client || typeof client.end !== 'function') return;
  try {
    await client.end({ timeout: 0 });
  } catch {
    // Zaten kapalı olabilir
  }
}

// İstek içi veya dev önbellekteki bağlantıyı sıfırla
export function resetSqlClient() {
  const holder = requestStorage.getStore();
  if (holder) {
    const previous = holder.sql;
    holder.sql = null;
    void endSqlClient(previous);
    const connectionString = resolveConnectionString();
    if (connectionString) {
      holder.sql = createSqlClient(connectionString);
    }
    return;
  }

  const previous = devCachedSql;
  devCachedSql = null;
  devCachedConnectionString = '';
  void endSqlClient(previous);
}

// Aktif SQL istemcisi — önce istek kapsamı, sonra dev önbellek
export function getSql() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  const holder = requestStorage.getStore();
  if (holder) {
    if (!holder.sql) {
      holder.sql = createSqlClient(connectionString);
    }
    return holder.sql;
  }

  if (devCachedSql && devCachedConnectionString === connectionString) {
    return devCachedSql;
  }

  devCachedConnectionString = connectionString;
  devCachedSql = createSqlClient(connectionString);
  return devCachedSql;
}

// Bağlantı canlı mı — kopmadan önce yakala
export async function pingSql(sql) {
  if (!sql) return false;
  try {
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}

// API handler — istek başına bağlantı aç/kapat (stale pooler önlenir)
export async function runHandlerWithSql(handler) {
  const connectionString = resolveConnectionString();

  if (!connectionString || !isServerlessRuntime()) {
    return handler();
  }

  const holder = { sql: createSqlClient(connectionString) };

  return requestStorage.run(holder, async () => {
    try {
      const alive = await pingSql(holder.sql);
      if (!alive) resetSqlClient();
      return await handler();
    } finally {
      const client = holder.sql;
      holder.sql = null;
      await endSqlClient(client);
    }
  });
}
