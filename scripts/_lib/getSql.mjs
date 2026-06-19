import postgres from 'postgres';

function isTransactionPooler(connectionString) {
  const url = String(connectionString || '');
  return /:6543(\/|\?|$)/.test(url) || /pooler\.supabase\.com/i.test(url);
}

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

// Scriptler için ortak bağlantı (TARGET_DATABASE_URL veya DATABASE_URL)
export function getSql(envKey = 'DATABASE_URL') {
  const connectionString = String(process.env[envKey] || process.env.DATABASE_URL || '').trim();
  if (!connectionString) return null;
  return postgres(connectionString, buildClientOptions(connectionString));
}
