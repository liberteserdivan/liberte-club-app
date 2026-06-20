import { getSql } from './sql.js';
import { parseAppStateData, serializeAppStateJson } from './appState.js';
import { GLOBAL_STATE_KEYS, RELATIONAL_STATE_KEYS, useRelationalState } from './relationalConfig.js';
import { loadMenuFromSql, upsertMenuToSql } from './menuStore.js';
import { loadHistoryFromSql, loadLoyaltyMapFromSql } from './loyaltyStore.js';
import { loadPushSubscriptionsFromSql, loadPushSubscriptionsForCustomer } from './pushStore.js';
import {
  ensureCustomersTables,
  customerRowToRecord,
  findCustomerById,
  findLoyaltyByCustomerId,
  loyaltyRowToCard,
  upsertCustomerRow,
  upsertLoyaltyRow
} from './customersStore.js';
import { upsertCustomerEmail } from './customerEmails.js';
import { migrateAllLoyalty } from '../../src/lib/loyaltyPoints.js';

const STATE_ID = 'liberte';

// Tam state'ten yalnızca global ayar dilimini çıkar
export function extractGlobalSlice(state = {}) {
  const global = {};
  for (const key of GLOBAL_STATE_KEYS) {
    if (state[key] != null) {
      global[key] = state[key];
    }
  }
  return global;
}

// Global dilime relational alanları ekleme — boş koleksiyonlar
export function emptyRelationalSlice() {
  return {
    customers: [],
    loyalty: {},
    categories: [],
    items: [],
    history: []
  };
}

// app_state revizyonunu güncelle — istemci sync tetiklemek için
export async function bumpAppStateRevision(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return null;

  const rows = await sql`
    UPDATE app_state
    SET updated_at = now()
    WHERE id = ${STATE_ID}
    RETURNING updated_at
  `;
  return rows[0]?.updated_at || null;
}

// Küçük global app_state satırını oku
async function loadGlobalSliceFromDb(sql) {
  const rows = await sql`SELECT data, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const raw = parseAppStateData(rows[0]?.data);
  const updatedAt = rows[0]?.updated_at ?? null;

  if (!raw) {
    return { global: {}, updatedAt };
  }

  const hasRelationalPayload = RELATIONAL_STATE_KEYS.some((key) => {
    const value = raw[key];
    if (key === 'loyalty') return value && Object.keys(value).length > 0;
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  if (hasRelationalPayload) {
    return { global: extractGlobalSlice(raw), updatedAt };
  }

  return { global: extractGlobalSlice(raw), updatedAt, legacyFull: raw };
}

// Tüm müşterileri SQL'den listele
async function listAllCustomersFromSql(sql) {
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
    FROM customers
    ORDER BY id ASC
  `;
  return rows.map(customerRowToRecord);
}

// Normalize tablolardan tam state birleştir
export async function composeStateFromRelational(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return { data: null, updatedAt: null };

  const [{ global, updatedAt, legacyFull }, menu, customers, loyalty, history, pushSubscriptions] = await Promise.all([
    loadGlobalSliceFromDb(sql),
    loadMenuFromSql(sql),
    listAllCustomersFromSql(sql),
    loadLoyaltyMapFromSql(sql),
    loadHistoryFromSql(sql),
    loadPushSubscriptionsFromSql(sql)
  ]);

  const migratedLoyalty = migrateAllLoyalty(
    Object.keys(loyalty).length ? loyalty : (legacyFull?.loyalty || {})
  );

  const data = {
    ...global,
    customers: customers.length ? customers : (legacyFull?.customers || []),
    loyalty: migratedLoyalty,
    categories: menu.categories.length ? menu.categories : (legacyFull?.categories || []),
    items: menu.items.length ? menu.items : (legacyFull?.items || []),
    history: history.length ? history : (legacyFull?.history || []),
    pushSubscriptions: pushSubscriptions.length
      ? pushSubscriptions
      : (global.pushSubscriptions || legacyFull?.pushSubscriptions || [])
  };

  return { data, updatedAt };
}

// Tek üye için hafif state — ana ekran sync'i tüm tabloyu çekmesin
export async function composeStateForCustomer(customerId, externalSql = null) {
  const sql = externalSql || getSql();
  const id = Number(customerId);
  if (!sql || !id) return { data: null, updatedAt: null };

  const [
    { global, updatedAt, legacyFull },
    menu,
    customer,
    loyaltyRow,
    history,
    pushSubscriptions
  ] = await Promise.all([
    loadGlobalSliceFromDb(sql),
    loadMenuFromSql(sql),
    findCustomerById(sql, id),
    findLoyaltyByCustomerId(sql, id),
    loadHistoryFromSql(sql, id),
    loadPushSubscriptionsForCustomer(sql, id)
  ]);

  const data = {
    ...global,
    customers: customer ? [customer] : [],
    loyalty: loyaltyRow ? { [id]: loyaltyRowToCard(loyaltyRow, id) } : {},
    categories: menu.categories.length ? menu.categories : (legacyFull?.categories || []),
    items: menu.items.length ? menu.items : (legacyFull?.items || []),
    history: history.length ? history : rowsForCustomer(legacyFull?.history, id),
    pushSubscriptions,
    notifications: []
  };

  return { data, updatedAt };
}

// Müşteri geçmiş satırlarını filtrele
function rowsForCustomer(list, customerId) {
  return (list || []).filter((row) => Number(row.customerId) === Number(customerId));
}

// Tam state'i normalize tablolara ve küçük global blob'a yaz
export async function persistStateToRelational(state, externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql || !state) throw new Error('DATABASE_URL eksik');

  for (const customer of state.customers || []) {
    await upsertCustomerRow(sql, customer);
    if (customer.email) {
      await upsertCustomerEmail(sql, {
        email: customer.email,
        customerId: customer.id,
        phone: customer.phone
      });
    }
  }

  for (const [customerId, card] of Object.entries(state.loyalty || {})) {
    await upsertLoyaltyRow(sql, customerId, card);
  }

  await upsertMenuToSql(state.categories || [], state.items || [], sql);

  const globalSlice = extractGlobalSlice(state);
  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${serializeAppStateJson(globalSlice)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;

  const rows = await sql`SELECT updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  return rows[0]?.updated_at ?? null;
}

// Legacy blob'u küçült — relational veriyi tablolara taşıdıktan sonra
export function buildSlimGlobalState(fullState = {}) {
  return extractGlobalSlice(fullState);
}

// app_state boyutunu MB cinsinden hesapla
export function estimateStateSizeMb(state) {
  if (!state) return 0;
  return Number((JSON.stringify(state).length / (1024 * 1024)).toFixed(2));
}

export { useRelationalState };
