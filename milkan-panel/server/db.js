import sql from 'mssql';
import { loadConfig } from './config.js';

let pool = null;

/** SQL bağlantı havuzunu döner; mock modda null */
export async function getPool() {
  const cfg = loadConfig();
  if (cfg.mock) return null;
  if (pool) return pool;

  pool = await sql.connect({
    server: cfg.sql.server,
    database: cfg.sql.database,
    user: cfg.sql.user,
    password: cfg.sql.password,
    options: cfg.sql.options
  });
  return pool;
}

/** Bağlantı durumunu kontrol eder */
export async function pingDatabase() {
  const cfg = loadConfig();
  if (cfg.mock) {
    return { ok: true, mode: 'mock' };
  }
  try {
    const p = await getPool();
    await p.request().query('SELECT 1 AS ok');
    return { ok: true, mode: 'sql', database: cfg.sql.database, server: cfg.sql.server };
  } catch (err) {
    return { ok: false, mode: 'sql', error: err.message };
  }
}

export { sql };
