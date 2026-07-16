#!/usr/bin/env node
/**
 * app_state.data JSONB → normalize PostgreSQL tablolarına taşıma.
 * Idempotent — tekrar çalıştırılabilir (ON CONFLICT upsert).
 *
 * Kullanım:
 *   node scripts/migrate-jsonb-to-relational.mjs --dry-run
 *   node scripts/migrate-jsonb-to-relational.mjs
 *   node scripts/migrate-jsonb-to-relational.mjs --slim
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';
import { normalizeEmail } from '../api/_lib/customerEmails.js';
import { grantAdminByPhone } from '../api/_lib/customersStore.js';
import { parseAppStateData, serializeAppStateJson } from '../api/_lib/appState.js';
import { buildSlimGlobalState, estimateStateSizeMb, extractGlobalSlice } from '../api/_lib/relationalState.js';

const STATE_ID = 'liberte';
const MIGRATION_ID = '001_jsonb_to_relational';
const ADMIN_PHONE = '05058665406';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    slim: argv.includes('--slim'),
    skipAdmin: argv.includes('--skip-admin')
  };
}

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Tarih alanlarını güvenli metne çevir
function safeText(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toLocaleString('tr-TR');
  }
  if (typeof value === 'object') return null;
  return String(value);
}

// JSON yazımı öncesi Date nesnelerini temizle
function deepSanitize(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = deepSanitize(entry);
    }
    return out;
  }
  return value;
}

function jsonSafe(value) {
  return JSON.stringify(deepSanitize(value));
}

// timestamptz sütunları için güvenli zaman damgası
function toTimestampParam(value) {
  const text = safeText(value);
  if (!text) return null;

  const tr = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (tr) {
    const pad = (part) => String(part).padStart(2, '0');
    const iso = `${tr[3]}-${pad(tr[2])}-${pad(tr[1])}T${pad(tr[4])}:${tr[5]}:${tr[6]}`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

// Şema SQL dosyasını uygula
async function applySchema(sql) {
  const schemaPath = join(root, 'scripts/sql/001_normalized_schema.sql');
  const ddl = readFileSync(schemaPath, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  await sql.unsafe(ddl);
}

// JSONB kaynaktan satır sayılarını hesapla
function countSource(state) {
  const loyaltyKeys = Object.keys(state.loyalty || {});
  const noteKeys = Object.keys(state.customerNotes || {});
  return {
    customers: (state.customers || []).length,
    customer_emails: (state.customers || []).filter((c) => normalizeEmail(c.email)).length,
    customer_loyalty: loyaltyKeys.length,
    loyalty_events: (state.history || []).length,
    menu_categories: (state.categories || []).length,
    menu_items: (state.items || []).length,
    campaigns: (state.campaigns || []).length,
    daily_campaigns: state.dailyCampaign ? 1 : 0,
    coupons: (state.coupons || []).length,
    coupon_uses: (state.couponUses || []).length,
    check_ins: (state.checkIns || []).length,
    wheel_prizes: (state.wheelPrizes || []).length,
    wheel_spins: (state.wheelSpins || []).length,
    daily_claims: (state.dailyClaims || []).length,
    first_order_bonuses: (state.firstOrderBonuses || []).length,
    referrals: (state.referrals || []).length,
    feedback: (state.feedback || []).length,
    google_review_requests: (state.googleReviewRequests || []).length,
    customer_notes: noteKeys.length,
    in_app_notifications: (state.notifications || []).length,
    push_subscriptions: (state.pushSubscriptions || []).length,
    push_send_log: (state.pushLog || []).length
  };
}

// Tek müşteri satırı ekle
async function insertCustomer(sql, customer) {
  const phone = cleanPhone(customer.phone);
  await sql`
    INSERT INTO customers (id, phone, normalized_phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit, legacy_json)
    VALUES (
      ${Number(customer.id)},
      ${phone},
      ${phone},
      ${String(customer.name || '')},
      ${customer.email ? normalizeEmail(customer.email) : null},
      ${customer.birthDate || null},
      ${customer.referralCode || null},
      ${Boolean(customer.isAdmin)},
      ${safeText(customer.createdAt)},
      ${safeText(customer.lastVisit)},
      ${jsonSafe({ ...customer, phone })}
    )
    ON CONFLICT (id) DO UPDATE SET
      phone = EXCLUDED.phone,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      birth_date = EXCLUDED.birth_date,
      referral_code = EXCLUDED.referral_code,
      is_admin = EXCLUDED.is_admin,
      created_at = EXCLUDED.created_at,
      last_visit = EXCLUDED.last_visit,
      legacy_json = EXCLUDED.legacy_json,
      updated_at = now()
  `;

  if (customer.email) {
    const normalizedEmail = normalizeEmail(customer.email);
    const phone = cleanPhone(customer.phone);
    await sql`
      INSERT INTO customer_emails (email, customer_id, phone, updated_at)
      VALUES (${normalizedEmail}, ${Number(customer.id)}, ${phone}, now())
      ON CONFLICT (email) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        phone = EXCLUDED.phone,
        updated_at = now()
    `;
  }
}

// Sadakat kartı ekle
async function insertLoyalty(sql, customerId, card) {
  await sql`
    INSERT INTO customer_loyalty (
      customer_id, total_stamps, lifetime_stamps, available_rewards, used_rewards,
      level, category_stamps, category_rewards, lp_balance, lp_lifetime, lp_schema_version, legacy_json
    )
    VALUES (
      ${Number(customerId)},
      ${Number(card.totalStamps || 0)},
      ${Number(card.lifetimeStamps || 0)},
      ${Number(card.availableRewards || 0)},
      ${Number(card.usedRewards || 0)},
      ${card.level || null},
      ${JSON.stringify(deepSanitize(card.categoryStamps || {}))},
      ${JSON.stringify(deepSanitize(card.categoryRewards || {}))},
      ${card.lpBalance != null ? Number(card.lpBalance) : null},
      ${card.lpLifetime != null ? Number(card.lpLifetime) : null},
      ${card.schemaVersion != null ? Number(card.schemaVersion) : (card.lpSchemaVersion != null ? Number(card.lpSchemaVersion) : null)},
      ${jsonSafe(card)}
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      total_stamps = EXCLUDED.total_stamps,
      lifetime_stamps = EXCLUDED.lifetime_stamps,
      available_rewards = EXCLUDED.available_rewards,
      used_rewards = EXCLUDED.used_rewards,
      level = EXCLUDED.level,
      category_stamps = EXCLUDED.category_stamps,
      category_rewards = EXCLUDED.category_rewards,
      lp_balance = EXCLUDED.lp_balance,
      lp_lifetime = EXCLUDED.lp_lifetime,
      lp_schema_version = EXCLUDED.lp_schema_version,
      legacy_json = EXCLUDED.legacy_json,
      revision = customer_loyalty.revision + 1,
      updated_at = now()
  `;
}

// app_state.data içeriğini tablolara taşı
async function migrateData(sql, state) {
  for (const customer of state.customers || []) {
    try {
      await insertCustomer(sql, deepSanitize(customer));
    } catch (error) {
      throw new Error(`customer ${customer?.id}: ${error.message}`);
    }
  }

  for (const [customerId, card] of Object.entries(state.loyalty || {})) {
    try {
      await insertLoyalty(sql, customerId, deepSanitize(card));
    } catch (error) {
      throw new Error(`loyalty ${customerId}: ${error.message}`);
    }
  }

  for (const raw of state.history || []) {
    const row = deepSanitize(raw);
    const createdAt = toTimestampParam(row.createdAt);
    await sql`
      INSERT INTO loyalty_events (id, customer_id, event_type, category, delta, note, menu_item_id, menu_item_name, created_at, legacy_json)
      VALUES (
        ${Number(row.id)},
        ${Number(row.customerId)},
        ${safeText(row.type || row.eventType || 'unknown') || 'unknown'},
        ${safeText(row.category)},
        ${row.delta != null ? Number(row.delta) : (row.lpAfter != null && row.lpBefore != null ? Number(row.lpAfter) - Number(row.lpBefore) : null)},
        ${safeText(row.note || row.source)},
        ${row.menuItemId != null ? Number(row.menuItemId) : null},
        ${safeText(row.menuItemName)},
        ${createdAt ?? sql`now()`},
        ${jsonSafe(row)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const [index, cat] of (state.categories || []).entries()) {
    await sql`
      INSERT INTO menu_categories (id, name, sort_order, legacy_json)
      VALUES (${Number(cat.id)}, ${cat.name || ''}, ${index}, ${jsonSafe(cat)})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, legacy_json = EXCLUDED.legacy_json
    `;
  }

  for (const item of state.items || []) {
    await sql`
      INSERT INTO menu_items (id, category_id, name, price, description, image, lp_gain, active, legacy_json)
      VALUES (
        ${Number(item.id)},
        ${item.categoryId != null ? Number(item.categoryId) : null},
        ${item.name || ''},
        ${item.price != null ? Number(item.price) : null},
        ${item.description || null},
        ${item.image || item.imageUrl || null},
        ${item.lpGain != null ? Number(item.lpGain) : null},
        ${item.active !== false},
        ${JSON.stringify(item)}
      )
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        image = EXCLUDED.image,
        lp_gain = EXCLUDED.lp_gain,
        active = EXCLUDED.active,
        legacy_json = EXCLUDED.legacy_json
    `;
  }

  const simpleTables = [
    ['coupons', state.coupons],
    ['coupon_uses', state.couponUses],
    ['check_ins', state.checkIns],
    ['wheel_prizes', state.wheelPrizes],
    ['wheel_spins', state.wheelSpins],
    ['daily_claims', state.dailyClaims],
    ['first_order_bonuses', state.firstOrderBonuses],
    ['referrals', state.referrals],
    ['feedback', state.feedback],
    ['google_review_requests', state.googleReviewRequests]
  ];

  for (const [table, rows] of simpleTables) {
    for (const row of rows || []) {
      if (table === 'coupons') {
        await sql`
          INSERT INTO coupons (id, code, title, reward_type, reward_value, active, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.code || ''}, ${row.title || null}, ${row.rewardType || null}, ${row.rewardValue != null ? Number(row.rewardValue) : null}, ${row.active !== false}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'coupon_uses') {
        await sql`
          INSERT INTO coupon_uses (id, coupon_id, customer_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.couponId != null ? Number(row.couponId) : null}, ${row.customerId != null ? Number(row.customerId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'check_ins') {
        await sql`
          INSERT INTO check_ins (id, customer_id, note, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.note || null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'wheel_prizes') {
        await sql`
          INSERT INTO wheel_prizes (id, label, prize_type, prize_value, weight, legacy_json)
          VALUES (${Number(row.id)}, ${row.label || ''}, ${row.type || null}, ${row.value != null ? Number(row.value) : null}, ${row.weight != null ? Number(row.weight) : 0}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'wheel_spins') {
        await sql`
          INSERT INTO wheel_spins (id, customer_id, prize_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.prizeId != null ? Number(row.prizeId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'daily_claims') {
        await sql`
          INSERT INTO daily_claims (id, customer_id, campaign_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.campaignId != null ? Number(row.campaignId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'first_order_bonuses') {
        await sql`
          INSERT INTO first_order_bonuses (id, customer_id, name, phone, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.name || null}, ${row.phone || null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'referrals') {
        await sql`
          INSERT INTO referrals (id, referrer_id, referred_id, code, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.referrerId != null ? Number(row.referrerId) : null}, ${row.referredId != null ? Number(row.referredId) : null}, ${row.code || null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'feedback') {
        await sql`
          INSERT INTO feedback (id, customer_id, rating, message, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.customerId != null ? Number(row.customerId) : null}, ${row.rating != null ? Number(row.rating) : null}, ${row.message || null}, ${row.createdAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'google_review_requests') {
        await sql`
          INSERT INTO google_review_requests (id, customer_id, status, created_at, approved_at, rejected_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.status || 'pending'}, ${row.createdAt || null}, ${row.approvedAt || null}, ${row.rejectedAt || null}, ${JSON.stringify(row)})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }
  }

  if (state.dailyCampaign) {
    const dc = state.dailyCampaign;
    await sql`
      INSERT INTO daily_campaigns (id, title, body, emoji, reward_type, reward_value, active, legacy_json)
      VALUES (
        ${Number(dc.id || 1)},
        ${dc.title || ''},
        ${dc.body || null},
        ${dc.emoji || null},
        ${dc.rewardType || null},
        ${dc.rewardValue != null ? Number(dc.rewardValue) : null},
        ${dc.active !== false},
        ${JSON.stringify(dc)}
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, legacy_json = EXCLUDED.legacy_json
    `;
  }

  for (const [customerId, note] of Object.entries(state.customerNotes || {})) {
    await sql`
      INSERT INTO customer_notes (customer_id, note)
      VALUES (${Number(customerId)}, ${String(note || '')})
      ON CONFLICT (customer_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now()
    `;
  }

  for (const row of state.notifications || []) {
    await sql`
      INSERT INTO in_app_notifications (id, customer_id, title, body, created_at, legacy_json)
      VALUES (
        ${Number(row.id)},
        ${row.customerId != null ? Number(row.customerId) : null},
        ${row.title || ''},
        ${row.body || null},
        ${safeText(row.createdAt)},
        ${JSON.stringify(row)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const row of state.pushSubscriptions || []) {
    await sql`
      INSERT INTO push_subscriptions (id, customer_id, token, channel, platform, active, created_at, legacy_json)
      VALUES (
        ${Number(row.id)},
        ${Number(row.customerId)},
        ${row.token || ''},
        ${row.channel || null},
        ${row.platform || null},
        ${row.active !== false},
        ${safeText(row.createdAt)},
        ${JSON.stringify(row)}
      )
      ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, active = EXCLUDED.active, legacy_json = EXCLUDED.legacy_json
    `;
  }

  for (const row of state.pushLog || []) {
    await sql`
      INSERT INTO push_send_log (id, title, body, audience, sent_count, created_at, legacy_json)
      VALUES (
        ${Number(row.id)},
        ${row.title || null},
        ${row.body || null},
        ${row.audience || null},
        ${row.sentCount != null ? Number(row.sentCount) : null},
        ${safeText(row.createdAt)},
        ${JSON.stringify(row)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// app_state blob'unu küçült — yalnızca global ayarlar kalsın
async function slimAppState(sql, fullState) {
  let source = fullState;

  // settings kaybolmasın — yedekte daha tam global dilim varsa onu kullan
  if (!source?.settings) {
    const backupRows = await sql`
      SELECT data FROM app_state_backups ORDER BY created_at DESC LIMIT 1
    `;
    const backup = parseAppStateData(backupRows[0]?.data);
    if (backup?.settings) {
      source = { ...backup, ...extractGlobalSlice(fullState), settings: backup.settings };
    }
  }

  const slim = buildSlimGlobalState(source);
  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${serializeAppStateJson(slim)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
  return slim;
}

async function countTable(sql, tableName) {
  const allowed = new Set(['customers', 'customer_loyalty', 'loyalty_events', 'menu_categories', 'menu_items']);
  if (!allowed.has(tableName)) return 0;
  const rows = await sql.unsafe(`SELECT count(*)::int AS c FROM ${tableName}`);
  return Number(rows[0]?.c || 0);
}

async function main() {
  loadEnv();
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  const { dryRun, slim, skipAdmin } = parseArgs(process.argv);
  const sql = getSql();
  if (!sql) {
    console.error('DATABASE_URL tanımlı değil.');
    process.exit(1);
  }

  try {
    const stateRows = await sql`SELECT data, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
    const state = parseAppStateData(stateRows[0]?.data);
    if (!state) {
      console.error('app_state kaydı bulunamadı.');
      process.exit(1);
    }

    const sizeBeforeMb = estimateStateSizeMb(state);
    const sourceCounts = countSource(state);
    const sourceChecksum = checksum(sourceCounts);

    console.log(JSON.stringify({
      phase: 'analyze',
      sizeBeforeMb,
      sourceCounts,
      checksum: sourceChecksum
    }, null, 2));

    if (dryRun) {
      console.log('DRY-RUN: şema ve veri yazılmadı.');
      process.exit(0);
    }

    await applySchema(sql);
    await migrateData(sql, state);

    if (!skipAdmin) {
      const admin = await grantAdminByPhone(sql, ADMIN_PHONE);
      if (!admin) {
        console.warn('Admin telefon bulunamadı:', ADMIN_PHONE);
      } else {
        console.log('Admin atandı:', { customerId: admin.id, phone: admin.phone, isAdmin: admin.isAdmin });
      }
    }

    let sizeAfterMb = sizeBeforeMb;
    if (slim) {
      const slimState = await slimAppState(sql, state);
      sizeAfterMb = estimateStateSizeMb(slimState);
      console.log('app_state küçültüldü:', { sizeBeforeMb, sizeAfterMb });
    }

    await sql`
      INSERT INTO schema_migrations (id, checksum, notes)
      VALUES (${MIGRATION_ID}, ${sourceChecksum}, ${slim ? 'migrate+slim' : 'migrate'})
      ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), notes = EXCLUDED.notes
    `;

    const tableCounts = {
      customers: await countTable(sql, 'customers'),
      customer_loyalty: await countTable(sql, 'customer_loyalty'),
      loyalty_events: await countTable(sql, 'loyalty_events'),
      menu_categories: await countTable(sql, 'menu_categories'),
      menu_items: await countTable(sql, 'menu_items')
    };

    console.log(JSON.stringify({
      ok: true,
      sizeBeforeMb,
      sizeAfterMb,
      tableCounts,
      next: slim
        ? 'Vercel USE_RELATIONAL_STATE=1 ayarla ve deploy et'
        : 'node scripts/migrate-jsonb-to-relational.mjs --slim'
    }, null, 2));
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch {
      // Pool kapanış hatasını yoksay
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
