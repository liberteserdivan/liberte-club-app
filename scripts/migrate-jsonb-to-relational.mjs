#!/usr/bin/env node
/**
 * app_state.data JSONB → normalize PostgreSQL tablolarına taşıma (hazırlık).
 * Production yazım yolu değişmez; USE_RELATIONAL_STATE=false kalır.
 *
 * Kullanım:
 *   DATABASE_URL=... node scripts/migrate-jsonb-to-relational.mjs --dry-run
 *   DATABASE_URL=... node scripts/migrate-jsonb-to-relational.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const STATE_ID = 'liberte';
const MIGRATION_ID = '001_jsonb_to_relational';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force')
  };
}

function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL eksik.');
    process.exit(1);
  }
  return neon(connectionString);
}

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Şema SQL dosyasını uygula
async function applySchema(sql) {
  const schemaPath = join(root, 'sql', '001_normalized_schema.sql');
  const ddl = readFileSync(schemaPath, 'utf8');
  const statements = ddl
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  for (const statement of statements) {
    await sql(statement);
  }
}

// JSONB kaynaktan satır sayılarını hesapla
function countSource(state) {
  const loyaltyKeys = Object.keys(state.loyalty || {});
  const noteKeys = Object.keys(state.customerNotes || {});
  return {
    customers: (state.customers || []).length,
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
  await sql`
    INSERT INTO customers (id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit, legacy_json)
    VALUES (
      ${Number(customer.id)},
      ${String(customer.phone || '')},
      ${String(customer.name || '')},
      ${customer.email || null},
      ${customer.birthDate || null},
      ${customer.referralCode || null},
      ${Boolean(customer.isAdmin)},
      ${customer.createdAt || null},
      ${customer.lastVisit || null},
      ${JSON.stringify(customer)}::jsonb
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
      ${JSON.stringify(card.categoryStamps || {})}::jsonb,
      ${JSON.stringify(card.categoryRewards || {})}::jsonb,
      ${card.lpBalance != null ? Number(card.lpBalance) : null},
      ${card.lpLifetime != null ? Number(card.lpLifetime) : null},
      ${card.lpSchemaVersion != null ? Number(card.lpSchemaVersion) : null},
      ${JSON.stringify(card)}::jsonb
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

// Genel koleksiyon satırı ekle — tablo adı sabit whitelist
async function insertRows(sql, table, rows, mapper) {
  for (const row of rows) {
    await mapper(sql, row);
  }
}

// app_state.data içeriğini tablolara taşı
async function migrateData(sql, state) {
  for (const customer of state.customers || []) {
    await insertCustomer(sql, customer);
  }

  for (const [customerId, card] of Object.entries(state.loyalty || {})) {
    await insertLoyalty(sql, customerId, card);
  }

  await insertRows(sql, 'loyalty_events', state.history || [], async (s, row) => {
    await s`
      INSERT INTO loyalty_events (id, customer_id, event_type, category, delta, note, menu_item_id, menu_item_name, created_at, legacy_json)
      VALUES (
        ${Number(row.id)},
        ${Number(row.customerId)},
        ${row.type || row.eventType || 'unknown'},
        ${row.category || null},
        ${row.delta != null ? Number(row.delta) : null},
        ${row.note || null},
        ${row.menuItemId != null ? Number(row.menuItemId) : null},
        ${row.menuItemName || null},
        ${row.createdAt || null},
        ${JSON.stringify(row)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;
  });

  for (const [index, cat] of (state.categories || []).entries()) {
    await sql`
      INSERT INTO menu_categories (id, name, sort_order, legacy_json)
      VALUES (${Number(cat.id)}, ${cat.name || ''}, ${index}, ${JSON.stringify(cat)}::jsonb)
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
        ${item.image || null},
        ${item.lpGain != null ? Number(item.lpGain) : null},
        ${item.active !== false},
        ${JSON.stringify(item)}::jsonb
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

  for (const row of state.campaigns || []) {
    await sql`
      INSERT INTO campaigns (id, title, body, emoji, active, legacy_json)
      VALUES (${Number(row.id)}, ${row.title || ''}, ${row.body || null}, ${row.emoji || null}, ${row.active !== false}, ${JSON.stringify(row)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
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
        ${JSON.stringify(dc)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, legacy_json = EXCLUDED.legacy_json
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

  for (const [, rows] of simpleTables) {
    for (const row of rows || []) {
      const table = simpleTables.find(([, r]) => r === rows)?.[0];
      if (!table) continue;

      if (table === 'coupons') {
        await sql`
          INSERT INTO coupons (id, code, title, reward_type, reward_value, active, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.code || ''}, ${row.title || null}, ${row.rewardType || null}, ${row.rewardValue != null ? Number(row.rewardValue) : null}, ${row.active !== false}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'coupon_uses') {
        await sql`
          INSERT INTO coupon_uses (id, coupon_id, customer_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.couponId != null ? Number(row.couponId) : null}, ${row.customerId != null ? Number(row.customerId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'check_ins') {
        await sql`
          INSERT INTO check_ins (id, customer_id, note, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.note || null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'wheel_prizes') {
        await sql`
          INSERT INTO wheel_prizes (id, label, prize_type, prize_value, weight, legacy_json)
          VALUES (${Number(row.id)}, ${row.label || ''}, ${row.type || null}, ${row.value != null ? Number(row.value) : null}, ${row.weight != null ? Number(row.weight) : 0}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'wheel_spins') {
        await sql`
          INSERT INTO wheel_spins (id, customer_id, prize_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.prizeId != null ? Number(row.prizeId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'daily_claims') {
        await sql`
          INSERT INTO daily_claims (id, customer_id, campaign_id, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.campaignId != null ? Number(row.campaignId) : null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'first_order_bonuses') {
        await sql`
          INSERT INTO first_order_bonuses (id, customer_id, name, phone, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.name || null}, ${row.phone || null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'referrals') {
        await sql`
          INSERT INTO referrals (id, referrer_id, referred_id, code, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.referrerId != null ? Number(row.referrerId) : null}, ${row.referredId != null ? Number(row.referredId) : null}, ${row.code || null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'feedback') {
        await sql`
          INSERT INTO feedback (id, customer_id, rating, message, created_at, legacy_json)
          VALUES (${Number(row.id)}, ${row.customerId != null ? Number(row.customerId) : null}, ${row.rating != null ? Number(row.rating) : null}, ${row.message || null}, ${row.createdAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      } else if (table === 'google_review_requests') {
        await sql`
          INSERT INTO google_review_requests (id, customer_id, status, created_at, approved_at, rejected_at, legacy_json)
          VALUES (${Number(row.id)}, ${Number(row.customerId)}, ${row.status || 'pending'}, ${row.createdAt || null}, ${row.approvedAt || null}, ${row.rejectedAt || null}, ${JSON.stringify(row)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }
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
        ${row.createdAt || null},
        ${JSON.stringify(row)}::jsonb
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
        ${row.createdAt || null},
        ${JSON.stringify(row)}::jsonb
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
        ${row.createdAt || null},
        ${JSON.stringify(row)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

async function main() {
  const { dryRun, force } = parseArgs(process.argv);
  const sql = getSql();

  const stateRows = await sql`SELECT data, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const state = stateRows[0]?.data;
  if (!state) {
    console.error('app_state kaydı bulunamadı.');
    process.exit(1);
  }

  const sourceCounts = countSource(state);
  const sourceChecksum = checksum(sourceCounts);

  console.log('Kaynak JSONB özet:', sourceCounts);
  console.log('Checksum:', sourceChecksum);

  if (dryRun) {
    console.log('DRY-RUN: şema ve veri yazılmadı.');
    process.exit(0);
  }

  const existing = await sql`
    SELECT id FROM schema_migrations WHERE id = ${MIGRATION_ID} LIMIT 1
  `;
  if (existing.length && !force) {
    console.error('Migration zaten uygulanmış. Tekrar için --force kullanın.');
    process.exit(1);
  }

  try {
    await applySchema(sql);
    await migrateData(sql, state);

    await sql`
      INSERT INTO schema_migrations (id, checksum, notes)
      VALUES (${MIGRATION_ID}, ${sourceChecksum}, ${'app_state.data → normalize tablolar'})
      ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), notes = EXCLUDED.notes
    `;

    console.log('Migration tamamlandı. app_state.data dokunulmadı (legacy).');
    console.log('Sonraki adım: node scripts/verify-migration.mjs');
  } catch (error) {
    console.error('Migration hatası — işlem geri alınmalı (Neon branch veya yedek):', error?.message || error);
    process.exit(1);
  }
}

main();
