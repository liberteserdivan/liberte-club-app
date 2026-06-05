import { neon } from '@neondatabase/serverless';
import { applyMenuSync } from './menuSync.js';

const STATE_ID = 'liberte';

// Uygulama durum tablosunu hazırla
async function ensureTables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// Neon bağlantısı oluştur
export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return neon(connectionString);
}

// Tüm uygulama durumunu yükle
export async function loadAppState() {
  const sql = getSql();
  if (!sql) return { data: null, updatedAt: null };

  await ensureTables(sql);
  const rows = await sql`SELECT data, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  let data = rows[0]?.data ?? null;
  let updatedAt = rows[0]?.updated_at ?? null;

  if (data) {
    const synced = applyMenuSync(data);
    if (synced.changed) {
      await saveAppState(synced.state);
      data = synced.state;
      updatedAt = new Date().toISOString();
    } else {
      data = synced.state;
    }
  }

  return { data, updatedAt };
}

// Uygulama durumunu kaydet
export async function saveAppState(data) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureTables(sql);
  await sql`INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}
