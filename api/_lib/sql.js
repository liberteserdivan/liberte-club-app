import postgres from 'postgres';

// Supabase transaction pooler (6543) prepared statement desteklemez
function isTransactionPooler(connectionString) {
  const url = String(connectionString || '');
  return /:6543(\/|\?|$)/.test(url) || /pooler\.supabase\.com/i.test(url);
}

// Vercel serverless için Postgres bağlantı seçenekleri
function buildClientOptions(connectionString) {
  const options = {
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20
  };

  if (isTransactionPooler(connectionString)) {
    options.prepare = false;
  }

  return options;
}

// Ortak SQL istemcisi — Neon, Supabase ve standart Postgres ile uyumlu
export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return postgres(connectionString, buildClientOptions(connectionString));
}
