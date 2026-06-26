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

// Vercel + Supabase pooler için bağlantı seçenekleri
function buildClientOptions(connectionString) {
  const transactionPooler = isTransactionPooler(connectionString);
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60
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
    options.connection = { application_name: 'liberte-club' };
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

// Bağlantıyı sıfırla — paylaşılan istemciyi KAPATMAZ.
// postgres.js bozuk bağlantıyı zaten atar; retry sorguyu yeni bağlantıda çalıştırır.
// Eşzamanlı isteklerin bağlantısını koparmamak için kasıtlı no-op.
export function resetSqlClient() {
  // Bilerek boş: kendi kendini iyileştiren istemci, elle müdahale gerektirmez.
}

// Aktif SQL istemcisi — istek kapsamı ile paylaşılan istemci aynıdır
export function getSql() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  const holder = requestStorage.getStore();
  if (holder?.sql) return holder.sql;

  return getOrCreateSharedSql(connectionString);
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
