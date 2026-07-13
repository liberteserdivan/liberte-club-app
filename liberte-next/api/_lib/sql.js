import postgres from 'postgres';

// Transaction pooler mı (PgBouncer / Supabase :6543)
function isTransactionPooler(connectionString) {
  const url = String(connectionString || '');
  return /:6543(\/|\?|$)/.test(url) || /pooler\.supabase\.com/i.test(url);
}

// DATABASE_URL çözümle — production'da Neon engelli
function resolveConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (env === 'production' && /neon\.tech/i.test(connectionString)) {
    console.error('[next.sql] neon blocked in production');
    return null;
  }
  return connectionString;
}

// postgres.js istemci seçenekleri
function createSqlClient(connectionString) {
  const transactionPooler = isTransactionPooler(connectionString);
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 8,
    max_lifetime: 60,
    connection: {
      application_name: 'liberte-next',
      statement_timeout: 12000
    }
  };
  if (transactionPooler) {
    options.prepare = false;
    options.fetch_types = false;
  }
  return postgres(connectionString, options);
}

let sharedSql = null;
let sharedUrl = '';

// Paylaşılan SQL istemcisi
export function getSql() {
  const url = resolveConnectionString();
  if (!url) return null;
  if (!sharedSql || sharedUrl !== url) {
    sharedSql = createSqlClient(url);
    sharedUrl = url;
  }
  return sharedSql;
}

// İstemciyi bırak (zorla end yok — in-flight koruması)
export function resetSql() {
  sharedSql = null;
  sharedUrl = '';
}
