import { neon } from '@neondatabase/serverless';
import { applyMenuSync } from './menuSync.js';
import { migrateAllLoyalty } from '../../src/lib/loyaltyPoints.js';

const STATE_ID = 'liberte';

// Tutulacak otomatik yedek sayısı ('pre-delete' yedekleri sınırsız korunur)
const MAX_AUTO_BACKUPS = 100;
// İki periyodik yedek arası en az süre (ms)
const BACKUP_THROTTLE_MS = 30 * 60 * 1000;

// Uygulama durum tablosunu hazırla
async function ensureTables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// Yedek tablosunu hazırla
async function ensureBackupTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state_backups (
    id bigserial PRIMARY KEY,
    data jsonb NOT NULL,
    reason text NOT NULL DEFAULT 'auto',
    customer_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// Neon bağlantısı oluştur
export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return neon(connectionString);
}

// Durumdaki müşteri sayısını güvenli oku
function customerCount(data) {
  return Array.isArray(data?.customers) ? data.customers.length : 0;
}

// Üzerine yazmadan önce mevcut durumu yedekle — üye kaybı geri alınabilsin
async function backupCurrentState(sql, nextData) {
  await ensureBackupTable(sql);

  const rows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const current = rows[0]?.data;
  if (!current) return; // İlk kayıt — yedeklenecek eski veri yok

  const prevCount = customerCount(current);
  // Üye/kayıt azalması = olası veri kaybı; her zaman yedekle
  const destructive = customerCount(nextData) < prevCount;

  const last = await sql`SELECT created_at FROM app_state_backups ORDER BY created_at DESC LIMIT 1`;
  const lastAt = last[0]?.created_at ? new Date(last[0].created_at).getTime() : 0;
  const periodic = Date.now() - lastAt > BACKUP_THROTTLE_MS;

  // Ne yıkıcı değişiklik ne de periyot dolmadıysa gereksiz yedek atma
  if (!destructive && !periodic) return;

  const reason = destructive ? 'pre-delete' : 'auto';
  await sql`INSERT INTO app_state_backups (data, reason, customer_count)
    VALUES (${JSON.stringify(current)}::jsonb, ${reason}, ${prevCount})`;

  // Budama: yalnızca en yeni 'auto' yedekleri tut; 'pre-delete' kayıtları korunur
  await sql`DELETE FROM app_state_backups
    WHERE reason = 'auto' AND id NOT IN (
      SELECT id FROM app_state_backups
      WHERE reason = 'auto'
      ORDER BY created_at DESC
      LIMIT ${MAX_AUTO_BACKUPS}
    )`;
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
    data = synced.state;

    const migratedLoyalty = migrateAllLoyalty(data.loyalty || {});
    const loyaltyChanged = JSON.stringify(migratedLoyalty) !== JSON.stringify(data.loyalty || {});
    if (loyaltyChanged) {
      data = { ...data, loyalty: migratedLoyalty };
    }

    if (synced.changed || loyaltyChanged) {
      await saveAppState(data);
      updatedAt = new Date().toISOString();
    }
  }

  return { data, updatedAt };
}

// Uygulama durumunu kaydet — kaydetmeden önce mevcut durumu yedekle
export async function saveAppState(data) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureTables(sql);

  // Üzerine yazmadan önce mevcut durumun yedeğini al (geri dönülebilsin)
  try {
    await backupCurrentState(sql, data);
  } catch {
    // Yedek başarısız olsa bile asıl kaydetmeyi engelleme
  }

  await sql`INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

// Yedek listesini getir (veri hariç, hafif özet)
export async function listBackups(limit = 50) {
  const sql = getSql();
  if (!sql) return [];

  await ensureBackupTable(sql);
  const rows = await sql`
    SELECT id, reason, customer_count, created_at
    FROM app_state_backups
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    reason: row.reason,
    customerCount: Number(row.customer_count),
    createdAt: row.created_at
  }));
}

// Seçili yedeği geri yükle — mevcut durum önce otomatik yedeklenir
export async function restoreBackup(backupId) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureBackupTable(sql);
  const rows = await sql`SELECT data FROM app_state_backups WHERE id = ${backupId} LIMIT 1`;
  const data = rows[0]?.data;
  if (!data) return false;

  await saveAppState(data);
  return true;
}
