import { getSql } from './sql.js';
import { isProductionRuntime } from './schemaReady.js';

// Realtime hazırlığı — varsayılan kapalı; production app_state akışını bozmaz
function isLoyaltyEventLogEnabled() {
  return String(process.env.ENABLE_LOYALTY_EVENT_LOG || '').trim() === '1';
}

// loyalty_events tablosunun varlığını garanti et
async function ensureLoyaltyEventTable(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS loyalty_events (
    id bigserial PRIMARY KEY,
    customer_id bigint NOT NULL,
    event_type text NOT NULL,
    category text,
    delta int,
    note text,
    menu_item_id bigint,
    menu_item_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    legacy_json jsonb
  )`;
}

// customer_loyalty.revision artırımı için tablo hazırlığı
async function ensureCustomerLoyaltyTable(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS customer_loyalty (
    customer_id bigint PRIMARY KEY,
    total_stamps int NOT NULL DEFAULT 0,
    lifetime_stamps int NOT NULL DEFAULT 0,
    available_rewards int NOT NULL DEFAULT 0,
    used_rewards int NOT NULL DEFAULT 0,
    level text,
    category_stamps jsonb NOT NULL DEFAULT '{}'::jsonb,
    category_rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
    lp_balance int,
    lp_lifetime int,
    lp_schema_version int,
    legacy_json jsonb,
    revision bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// Kasa LP işlemi sonrası event kaydı (ileride Supabase Realtime tetikleyicisi)
export async function recordLoyaltyEvent({
  customerId,
  eventType,
  category = null,
  delta = null,
  note = null,
  menuItemId = null,
  menuItemName = null,
  payload = null
}) {
  if (!isLoyaltyEventLogEnabled()) return { ok: true, skipped: true };

  const sql = getSql();
  if (!sql || !customerId || !eventType) return { ok: false, skipped: true };

  try {
    await ensureLoyaltyEventTable(sql);
    await sql`
      INSERT INTO loyalty_events (
        customer_id, event_type, category, delta, note, menu_item_id, menu_item_name, legacy_json
      ) VALUES (
        ${Number(customerId)},
        ${String(eventType)},
        ${category},
        ${delta},
        ${note},
        ${menuItemId},
        ${menuItemName},
        ${payload ? JSON.stringify(payload) : null}::jsonb
      )
    `;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// Müşteri loyalty revision artır — kanal: loyalty:{customerId}
export async function bumpCustomerLoyaltyRevision(customerId) {
  if (!isLoyaltyEventLogEnabled()) return { ok: true, skipped: true };

  const sql = getSql();
  if (!sql || !customerId) return { ok: false, skipped: true };

  try {
    await ensureCustomerLoyaltyTable(sql);
    await sql`
      INSERT INTO customer_loyalty (customer_id, revision, updated_at)
      VALUES (${Number(customerId)}, 1, now())
      ON CONFLICT (customer_id) DO UPDATE SET
        revision = customer_loyalty.revision + 1,
        updated_at = now()
    `;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
