import { applyMenuSync } from './menuSync.js';
import { migrateAllLoyalty } from '../../src/lib/loyaltyPoints.js';
import { buildInitialAppState } from './appStateSeed.js';
import { getSql } from './sql.js';
import { ensureSchemaReady } from './schemaReady.js';
import {
  invalidateAppStateCache,
  readAppStateCache,
  writeAppStateCache
} from './appStateCache.js';
import { logAppStatePerf, perfNow } from './appStatePerf.js';

export { getSql } from './sql.js';

const STATE_ID = 'liberte';

// jsonb sütununu nesneye çevir — transaction pooler bazen ham JSON string döndürür
export function parseAppStateData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

// jsonb yazımı — string spread hatasını önler
function toJsonbParam(sql, data) {
  return sql.json(data);
}

// Tutulacak otomatik yedek sayısı ('pre-delete' yedekleri sınırsız korunur)
const MAX_AUTO_BACKUPS = 100;
// İki periyodik yedek arası en az süre (ms)
const BACKUP_THROTTLE_MS = 30 * 60 * 1000;

// Uygulama durum tablosunu hazırla
async function ensureTables(sql) {
  await ensureSchemaReady(sql);
}

// Yedek tablosunu hazırla
async function ensureBackupTable(sql) {
  await ensureSchemaReady(sql);
}

// Durumdaki müşteri sayısını güvenli oku
function customerCount(data) {
  return Array.isArray(data?.customers) ? data.customers.length : 0;
}

// İstemci ve sunucu güncelleme zamanını karşılaştır
export function isSameAppStateRevision(serverAt, clientAt) {
  if (!serverAt || !clientAt) return false;
  const serverParsed = Date.parse(String(serverAt));
  const clientParsed = Date.parse(String(clientAt));
  if (Number.isNaN(serverParsed) || Number.isNaN(clientParsed)) return false;
  return new Date(serverParsed).toISOString() === new Date(clientParsed).toISOString();
}

// Üzerine yazmadan önce mevcut durumu yedekle — üye kaybı geri alınabilsin
async function backupCurrentState(sql, nextData) {
  await ensureBackupTable(sql);

  const rows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const current = parseAppStateData(rows[0]?.data);
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
    VALUES (${toJsonbParam(sql, current)}, ${reason}, ${prevCount})`;

  // Budama: yalnızca en yeni 'auto' yedekleri tut; 'pre-delete' kayıtları korunur
  await sql`DELETE FROM app_state_backups
    WHERE reason = 'auto' AND id NOT IN (
      SELECT id FROM app_state_backups
      WHERE reason = 'auto'
      ORDER BY created_at DESC
      LIMIT ${MAX_AUTO_BACKUPS}
    )`;
}

// Yalnızca güncelleme zamanını oku — tam JSON çekmeden değişiklik kontrolü
export async function loadAppStateRevision() {
  const t0 = perfNow();
  const cached = readAppStateCache();
  if (cached?.updatedAt) {
    logAppStatePerf('loadAppStateRevision.cache_hit', t0);
    return { updatedAt: cached.updatedAt };
  }

  const sql = getSql();
  if (!sql) return { updatedAt: null };

  await ensureTables(sql);
  const rows = await sql`SELECT updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  logAppStatePerf('loadAppStateRevision', t0);
  return { updatedAt: rows[0]?.updated_at ?? null };
}

// Tüm uygulama durumunu yükle
export async function loadAppState(options = {}) {
  const skipPersist = Boolean(options.skipPersist);
  const skipCache = Boolean(options.skipCache);
  const t0 = perfNow();

  if (!skipCache) {
    const cached = readAppStateCache();
    if (cached?.data) {
      logAppStatePerf('loadAppState.cache_hit', t0);
      return { data: cached.data, updatedAt: cached.updatedAt };
    }
  }

  const sql = getSql();
  if (!sql) return { data: null, updatedAt: null };

  const tEnsure = perfNow();
  await ensureTables(sql);
  logAppStatePerf('ensureTables', tEnsure);

  const tSelect = perfNow();
  const rows = await sql`SELECT data, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  logAppStatePerf('select_app_state', tSelect);

  let data = parseAppStateData(rows[0]?.data);
  let updatedAt = rows[0]?.updated_at ?? null;

  if (!data) {
    data = buildInitialAppState();
    await saveAppState(data);
    updatedAt = new Date().toISOString();
    writeAppStateCache(data, updatedAt);
    logAppStatePerf('loadAppState.seed', t0);
    return { data, updatedAt };
  }

  const synced = applyMenuSync(data);
  data = synced.state;

  const migratedLoyalty = migrateAllLoyalty(data.loyalty || {});
  const loyaltyChanged = JSON.stringify(migratedLoyalty) !== JSON.stringify(data.loyalty || {});
  if (loyaltyChanged) {
    data = { ...data, loyalty: migratedLoyalty };
  }

  if (!skipPersist && (synced.changed || loyaltyChanged)) {
    await saveAppState(data);
    updatedAt = new Date().toISOString();
  }

  writeAppStateCache(data, updatedAt);
  logAppStatePerf('loadAppState', t0, { skipPersist, skipCache });
  return { data, updatedAt };
}

// Uygulama durumunu kaydet — kaydetmeden önce mevcut durumu yedekle
export async function saveAppState(data) {
  const t0 = perfNow();
  invalidateAppStateCache();

  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureTables(sql);

  try {
    await backupCurrentState(sql, data);
  } catch (error) {
    console.error('[appState.save] backup failed', error?.message || error);
  }

  await sql`INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${toJsonbParam(sql, data)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;

  logAppStatePerf('saveAppState', t0);
}

// Optimistic lock — beklenen updated_at uyuşmazsa yazma
export async function saveAppStateIfUnchanged(data, expectedUpdatedAt) {
  const t0 = perfNow();
  invalidateAppStateCache();

  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureTables(sql);

  if (!expectedUpdatedAt) {
    await saveAppState(data);
    const revision = await loadAppStateRevision();
    return { ok: true, updatedAt: revision.updatedAt };
  }

  const currentRows = await sql`
    SELECT updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1
  `;
  const serverAt = currentRows[0]?.updated_at ?? null;

  if (!isSameAppStateRevision(serverAt, expectedUpdatedAt)) {
    return { ok: false, conflict: true, updatedAt: serverAt };
  }

  try {
    await backupCurrentState(sql, data);
  } catch {
    // Yedek başarısız olsa bile kayıt denenir
  }

  const updated = await sql`
    UPDATE app_state
    SET data = ${toJsonbParam(sql, data)}, updated_at = now()
    WHERE id = ${STATE_ID} AND updated_at = ${serverAt}
    RETURNING updated_at
  `;

  if (!updated.length) {
    const revision = await loadAppStateRevision();
    return { ok: false, conflict: true, updatedAt: revision.updatedAt };
  }

  logAppStatePerf('saveAppStateIfUnchanged', t0);
  return { ok: true, updatedAt: updated[0].updated_at };
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
  const data = parseAppStateData(rows[0]?.data);
  if (!data) return false;

  await saveAppState(data);
  return true;
}
