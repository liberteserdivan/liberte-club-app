// Veritabanı bağlantı bilgisini secret sızdırmadan özetle
export function describeDatabaseUrl(connectionString) {
  const url = String(connectionString || '').trim();
  if (!url) {
    return {
      provider: 'unknown',
      hostMasked: null,
      port: null,
      ssl: false,
      pooler: false,
      relationalState: String(process.env.USE_RELATIONAL_STATE || '').trim() === '1',
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
    };
  }

  let host = '';
  let port = null;
  let ssl = /sslmode=require/i.test(url) || /ssl=require/i.test(url);

  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//i, 'https://'));
    host = parsed.hostname || '';
    port = parsed.port ? Number(parsed.port) : 5432;
    if (parsed.searchParams.get('sslmode') === 'require') ssl = true;
  } catch {
    const hostMatch = url.match(/@([^/:?]+)/);
    host = hostMatch?.[1] || '';
    const portMatch = url.match(/:(\d{4,5})(?:\/|\?|$)/);
    port = portMatch ? Number(portMatch[1]) : null;
  }

  const hostLower = host.toLowerCase();
  let provider = 'unknown';
  if (/neon\.tech/i.test(hostLower) || /aws\.neon/i.test(url)) provider = 'neon';
  else if (/supabase\.com/i.test(hostLower) || /supabase\.co/i.test(hostLower)) provider = 'supabase';

  const pooler = /pooler\.supabase\.com/i.test(hostLower) || port === 6543;

  // Host'un ilk ve son segmentini göster — credential yok
  const hostMasked = host
    ? host.replace(/^([^.]+)\.(.+)$/, (_, a, rest) => `${a}.***.${rest.split('.').slice(-2).join('.')}`)
    : null;

  return {
    provider,
    hostMasked,
    port,
    ssl,
    pooler,
    transactionPooler: pooler && port === 6543,
    relationalState: String(process.env.USE_RELATIONAL_STATE || '').trim() === '1',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
  };
}

let loggedOnce = false;

// İlk bağlantıda bir kez logla — Vercel loglarında provider doğrulama
export function logDatabaseConnectionOnce(connectionString) {
  if (loggedOnce) return;
  loggedOnce = true;

  const info = describeDatabaseUrl(connectionString);
  console.info('[db.connection]', JSON.stringify({
    provider: info.provider,
    hostMasked: info.hostMasked,
    port: info.port,
    ssl: info.ssl,
    pooler: info.pooler,
    transactionPooler: info.transactionPooler,
    relationalState: info.relationalState,
    env: info.env
  }));
}
