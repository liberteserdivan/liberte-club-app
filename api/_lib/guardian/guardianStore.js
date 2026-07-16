import { getSql } from '../sql.js';
import { isProductionRuntime } from '../schemaReady.js';

const SAFE_MODE_ROW_ID = 'singleton';
let tablesReady = false;

// Guardian tabloları — production'da DDL YAPILMAZ (transaction pooler DDL'de asılı kalır)
async function ensureGuardianTables(sql) {
  if (tablesReady) return;
  if (isProductionRuntime()) {
    tablesReady = true;
    return;
  }
  await sql`CREATE TABLE IF NOT EXISTS guardian_safe_mode (
    id text PRIMARY KEY DEFAULT 'singleton',
    config jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS guardian_incidents (
    id text PRIMARY KEY,
    level text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    title text,
    affected_area text,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    requires_human boolean NOT NULL DEFAULT false,
    data jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_guardian_incidents_status
    ON guardian_incidents (status, last_seen_at DESC)`;
  tablesReady = true;
}

function resolveSql() {
  try { return getSql(); } catch { return null; }
}

export async function loadSafeModeConfigFromDb() {
  const sql = resolveSql();
  if (!sql) return null;
  try {
    await ensureGuardianTables(sql);
    const rows = await sql`SELECT config FROM guardian_safe_mode WHERE id = ${SAFE_MODE_ROW_ID} LIMIT 1`;
    return rows[0]?.config || null;
  } catch { return null; }
}

export async function persistSafeModeConfigToDb(config) {
  const sql = resolveSql();
  if (!sql || !config) return false;
  try {
    await ensureGuardianTables(sql);
    await sql`
      INSERT INTO guardian_safe_mode (id, config, updated_at)
      VALUES (${SAFE_MODE_ROW_ID}, ${sql.json(config)}, now())
      ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()
    `;
    return true;
  } catch { return false; }
}

export async function persistIncidentToDb(incident) {
  const sql = resolveSql();
  if (!sql || !incident?.id) return false;
  const { _key, ...payload } = incident;
  const data = { ...payload, _key: _key || null };
  try {
    await ensureGuardianTables(sql);
    await sql`
      INSERT INTO guardian_incidents (
        id, level, status, title, affected_area,
        started_at, last_seen_at, requires_human, data, updated_at
      ) VALUES (
        ${incident.id}, ${incident.level || 'incident'}, ${incident.status || 'open'},
        ${incident.title || ''}, ${incident.affectedArea || 'api'},
        ${incident.startedAt || new Date().toISOString()},
        ${incident.lastSeenAt || new Date().toISOString()},
        ${Boolean(incident.requiresHuman)}, ${sql.json(data)}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        level = EXCLUDED.level, status = EXCLUDED.status, title = EXCLUDED.title,
        affected_area = EXCLUDED.affected_area, last_seen_at = EXCLUDED.last_seen_at,
        requires_human = EXCLUDED.requires_human, data = EXCLUDED.data, updated_at = now()
    `;
    return true;
  } catch { return false; }
}

export async function loadOpenIncidentsFromDb(limit = 50) {
  const sql = resolveSql();
  if (!sql) return [];
  try {
    await ensureGuardianTables(sql);
    const rows = await sql`
      SELECT data FROM guardian_incidents WHERE status = 'open'
      ORDER BY last_seen_at DESC LIMIT ${limit}
    `;
    return rows.map((row) => row.data).filter(Boolean);
  } catch { return []; }
}

export function resetGuardianStoreCache() { tablesReady = false; }