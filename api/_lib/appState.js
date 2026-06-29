import { applyMenuSync } from './menuSync.js';
import { migrateAllLoyalty } from '../../src/lib/loyaltyPoints.js';
import { buildInitialAppState } from './appStateSeed.js';
import { getSql } from './sql.js';
import { ensureSchemaReady } from './schemaReady.js';
import {
  invalidateAppStateCache,
  readAppStateCache,
  readAppStateCacheForCustomer,
  writeAppStateCache,
  writeAppStateCacheForCustomer
} from './appStateCache.js';
import { logAppStatePerf, perfNow } from './appStatePerf.js';
import { useRelationalState, composeStateFromRelational, composeStateForCustomer, persistStateToRelational } from './relationalState.js';

export { getSql } from './sql.js';

const STATE_ID = 'liberte';

// jsonb sütununu nesneye çevir — çift kodlanmış string ve pooler ham JSON desteklenir
export function parseAppStateData(raw, maxDepth = 4) {
  let current = raw;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (current == null) return null;
    if (typeof current === 'object' && !Array.isArray(current)) return current;
    if (typeof current !== 'string') return null;

    const trimmed = current.trim();
    if (!trimmed) return null;

    try {
      current = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  return typeof current === 'object' && !Array.isArray(current) ? current : null;
}

// jsonb yazımı — büyük payload'da sql.json hata verir; string parametre jsonb'ye yazılır
export function serializeAppStateJson(data) {
  return JSON.stringify(JSON.parse(JSON.stringify(data)));
}

function toJsonbParam(_sql, data) {
  return serializeAppStateJson(data);
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
async function backupCurrentState(sql, nextData, currentSnapshot = null) {
  await ensureBackupTable(sql);

  let current = currentSnapshot;
  if (!current) {
    const rows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
    current = parseAppStateData(rows[0]?.data);
  }
  if (!current) return;

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

// Yalnızca güncelleme zamanını oku — tam JSON çekmeden değişiklik kontrolü.
// B-5: Değişiklik sinyali ARTIK yerel önbellekten okunmaz; her zaman DB'den
// (tek satır, PK lookup — çok ucuz) okunur. Çok-instanslı Vercel'de bir
// instance'ın bayat önbelleği "değişmedi" deyip istemciyi yanlış yere senkronsuz
// bırakıyordu. Doğru revizyon, tutarlılığın anahtarıdır.
export async function loadAppStateRevision() {
  const t0 = perfNow();
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

  if (useRelationalState()) {
    if (!skipCache) {
      const cached = readAppStateCache();
      if (cached?.data) {
        logAppStatePerf('loadAppState.relational.cache_hit', t0);
        return { data: cached.data, updatedAt: cached.updatedAt };
      }
    }

    const composed = await composeStateFromRelational();
    if (composed.data) {
      writeAppStateCache(composed.data, composed.updatedAt);
      logAppStatePerf('loadAppState.relational', t0);
      return composed;
    }
  }

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
    // Salt-okuma (skipPersist) modunda seed'i veritabanına YAZMA.
    // GET akışında yazma yan etkisi olmasın diye hesaplanan başlangıç
    // durumunu döndür; saveAppState çağrılmaz (yavaş GET / çift yazma riski yok).
    if (skipPersist) {
      logAppStatePerf('loadAppState.seed.skipPersist', t0);
      return { data, updatedAt: null };
    }
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

// Üye oturumu için hafif state yükle
export async function loadAppStateForCustomer(customerId, options = {}) {
  const skipCache = Boolean(options.skipCache);
  const t0 = perfNow();

  if (!useRelationalState() || !customerId) {
    return loadAppState(options);
  }

  if (!skipCache) {
    const cached = readAppStateCacheForCustomer(customerId);
    if (cached?.data) {
      logAppStatePerf('loadAppStateForCustomer.cache_hit', t0);
      return { data: cached.data, updatedAt: cached.updatedAt };
    }
  }

  const composed = await composeStateForCustomer(customerId);
  if (composed.data) {
    writeAppStateCacheForCustomer(customerId, composed.data, composed.updatedAt);
    logAppStatePerf('loadAppStateForCustomer', t0);
  }
  return composed;
}

// Uygulama durumunu kaydet — kaydetmeden önce mevcut durumu yedekle
export async function saveAppState(data, options = {}) {
  const skipBackup = Boolean(options.skipBackup);
  const t0 = perfNow();
  invalidateAppStateCache();

  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  if (useRelationalState()) {
    if (!skipBackup) {
      try {
        const composed = await composeStateFromRelational(sql);
        if (composed.data) {
          await backupCurrentState(sql, data, composed.data);
        }
      } catch (error) {
        console.error('[appState.save.relational] backup failed', error?.message || error);
      }
    }
    const updatedAt = await persistStateToRelational(data, sql);
    logAppStatePerf('saveAppState.relational', t0);
    return updatedAt;
  }

  await ensureTables(sql);

  if (!skipBackup) {
    try {
      await backupCurrentState(sql, data);
    } catch (error) {
      console.error('[appState.save] backup failed', error?.message || error);
    }
  }

  await sql`INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${toJsonbParam(sql, data)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;

  logAppStatePerf(skipBackup ? 'saveAppState.fast' : 'saveAppState', t0, { skipBackup });
}

// jsonb kökünü nesneye normalize et — string/scalar kayıtlarda jsonb_set hatasını önler
function normalizedAppStateDoc(sql) {
  return sql`CASE
    WHEN jsonb_typeof(data) = 'string' THEN (data #>> '{}')::jsonb
    WHEN jsonb_typeof(data) = 'object' THEN data
    ELSE '{}'::jsonb
  END`;
}

// customers alanını dizi olarak oku — eski object map formatını destekler
function normalizedCustomersArray(sql, docExpr) {
  return sql`CASE
    WHEN jsonb_typeof(${docExpr} -> 'customers') = 'array' THEN ${docExpr} -> 'customers'
    WHEN jsonb_typeof(${docExpr} -> 'customers') = 'object' THEN (
      SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
      FROM jsonb_each(${docExpr} -> 'customers')
    )
    ELSE '[]'::jsonb
  END`;
}

// Yeni üye kaydı — 50MB+ app_state tam yazımı yerine jsonb patch
export async function patchAppStateRegistration(sql, {
  customer,
  loyaltyEntry,
  historyEntry = null,
  referralEntry = null,
  extraLoyaltyEntries = {}
}) {
  const t0 = perfNow();
  invalidateAppStateCache();
  await ensureTables(sql);

  const doc = normalizedAppStateDoc(sql);
  const customers = normalizedCustomersArray(sql, doc);
  const loyaltyPatch = { [String(customer.id)]: loyaltyEntry, ...extraLoyaltyEntries };
  const loyaltyJson = serializeAppStateJson(loyaltyPatch);

  if (referralEntry && historyEntry) {
    await sql`
      UPDATE app_state
      SET data = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              ${doc},
              '{customers}',
              ${customers} || jsonb_build_array(${sql.json(customer)}),
              true
            ),
            '{loyalty}',
            COALESCE((${doc} -> 'loyalty'), '{}'::jsonb) || ${loyaltyJson}::jsonb,
            true
          ),
          '{history}',
          ${serializeAppStateJson([historyEntry])}::jsonb || COALESCE((${doc} -> 'history'), '[]'::jsonb),
          true
        ),
        '{referrals}',
        ${serializeAppStateJson([referralEntry])}::jsonb || COALESCE((${doc} -> 'referrals'), '[]'::jsonb),
        true
      ),
      updated_at = now()
      WHERE id = ${STATE_ID}
    `;
  } else if (historyEntry) {
    await sql`
      UPDATE app_state
      SET data = jsonb_set(
        jsonb_set(
          jsonb_set(
            ${doc},
            '{customers}',
            ${customers} || jsonb_build_array(${sql.json(customer)}),
            true
          ),
          '{loyalty}',
          COALESCE((${doc} -> 'loyalty'), '{}'::jsonb) || ${loyaltyJson}::jsonb,
          true
        ),
        '{history}',
        ${serializeAppStateJson([historyEntry])}::jsonb || COALESCE((${doc} -> 'history'), '[]'::jsonb),
        true
      ),
      updated_at = now()
      WHERE id = ${STATE_ID}
    `;
  } else {
    await sql`
      UPDATE app_state
      SET data = jsonb_set(
        jsonb_set(
          ${doc},
          '{customers}',
          ${customers} || jsonb_build_array(${sql.json(customer)}),
          true
        ),
        '{loyalty}',
        COALESCE((${doc} -> 'loyalty'), '{}'::jsonb) || ${loyaltyJson}::jsonb,
        true
      ),
      updated_at = now()
      WHERE id = ${STATE_ID}
    `;
  }

  logAppStatePerf('patchAppStateRegistration', t0);
}

// Optimistic lock — beklenen updated_at uyuşmazsa yazma
export async function saveAppStateIfUnchanged(data, expectedUpdatedAt) {
  const t0 = perfNow();
  invalidateAppStateCache();

  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  await ensureTables(sql);

  if (!expectedUpdatedAt) {
    if (useRelationalState()) {
      await persistStateToRelational(data, sql);
      const revision = await loadAppStateRevision();
      return { ok: true, updatedAt: revision.updatedAt };
    }
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
    if (useRelationalState()) {
      const composed = await composeStateFromRelational(sql);
      if (composed.data) {
        await backupCurrentState(sql, data, composed.data);
      }
    } else {
      await backupCurrentState(sql, data);
    }
  } catch {
    // Yedek başarısız olsa bile kayıt denenir
  }

  if (useRelationalState()) {
    const updatedAt = await persistStateToRelational(data, sql);
    logAppStatePerf('saveAppStateIfUnchanged.relational', t0);
    return { ok: true, updatedAt };
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
