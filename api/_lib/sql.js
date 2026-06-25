import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import { describeDatabaseUrl, logDatabaseConnectionOnce } from './dbConnection.js';
import { isTransientDbError } from './dbTransient.js';

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
    connect_timeout: 10,
    max_lifetime: 60
  };

  if (transactionPooler) {
    options.prepare = false;
    options.fetch_types = false;
    // Pooler idle limitinden önce yenile — kopmayı önler
    options.idle_timeout = 45;
    options.max_lifetime = 50;
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

// İstek kapsamı — handler içinde getSql aynı bağlantıyı döner
const requestStorage = new AsyncLocalStorage();

// Vercel instance önbelleği — istekler arası yeniden kullan
let warmSql = null;
let warmConnectionString = '';

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

// Instance önbelleğini temizle
async function closeWarmSql() {
  if (!warmSql) return;
  const previous = warmSql;
  warmSql = null;
  warmConnectionString = '';
  await endSqlClient(previous);
}

// Canlı warm bağlantı — kopmuşsa yeniden aç
async function ensureLiveWarmSql(connectionString) {
  if (!warmSql || warmConnectionString !== connectionString) {
    await closeWarmSql();
    warmSql = createSqlClient(connectionString);
    warmConnectionString = connectionString;
    return warmSql;
  }

  const alive = await pingSql(warmSql);
  if (!alive) {
    await closeWarmSql();
    warmSql = createSqlClient(connectionString);
    warmConnectionString = connectionString;
  }

  return warmSql;
}

// Kopan bağlantıyı güvenli sıfırla — sızıntı olmadan
export async function resetSqlClient() {
  const holder = requestStorage.getStore();
  const connectionString = resolveConnectionString();

  if (holder) {
    holder.sql = null;
    await closeWarmSql();
    if (connectionString) {
      holder.sql = await ensureLiveWarmSql(connectionString);
    }
    return;
  }

  await closeWarmSql();

  const previous = devCachedSql;
  devCachedSql = null;
  devCachedConnectionString = '';
  await endSqlClient(previous);
}

// Aktif SQL istemcisi — önce istek kapsamı, sonra dev önbellek
export function getSql() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  const holder = requestStorage.getStore();
  if (holder) {
    if (!holder.sql) {
      holder.sql = warmSql && warmConnectionString === connectionString
        ? warmSql
        : createSqlClient(connectionString);
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

// API handler — warm bağlantı + ping (istek başına aç/kapat yok)
export async function runHandlerWithSql(handler) {
  const connectionString = resolveConnectionString();

  if (!connectionString || !isServerlessRuntime()) {
    return handler();
  }

  const client = await ensureLiveWarmSql(connectionString);
  const holder = { sql: client };

  return requestStorage.run(holder, async () => {
    try {
      return await handler();
    } catch (error) {
      if (isTransientDbError(error)) {
        await resetSqlClient();
      }
      throw error;
    }
  });
}
