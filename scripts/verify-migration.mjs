#!/usr/bin/env node
/**
 * JSONB kaynak ile normalize tablolar arasında sayım ve checksum doğrulaması.
 *
 * Kullanım:
 *   DATABASE_URL=... node scripts/verify-migration.mjs
 */
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const STATE_ID = 'liberte';

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

// Relational tablo satır sayılarını oku
async function countTarget(sql) {
  const tables = [
    'customers',
    'customer_loyalty',
    'loyalty_events',
    'menu_categories',
    'menu_items',
    'campaigns',
    'daily_campaigns',
    'coupons',
    'coupon_uses',
    'check_ins',
    'wheel_prizes',
    'wheel_spins',
    'daily_claims',
    'first_order_bonuses',
    'referrals',
    'feedback',
    'google_review_requests',
    'customer_notes',
    'in_app_notifications',
    'push_subscriptions',
    'push_send_log'
  ];

  const counts = {};
  for (const table of tables) {
    const rows = await sql(`SELECT COUNT(*)::int AS c FROM ${table}`);
    counts[table] = Number(rows[0]?.c ?? 0);
  }
  return counts;
}

async function main() {
  const sql = getSql();

  const stateRows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const state = stateRows[0]?.data;
  if (!state) {
    console.error('app_state kaydı bulunamadı.');
    process.exit(1);
  }

  const source = countSource(state);
  const target = await countTarget(sql);

  const mapping = {
    customers: 'customers',
    customer_loyalty: 'customer_loyalty',
    loyalty_events: 'loyalty_events',
    menu_categories: 'menu_categories',
    menu_items: 'menu_items',
    campaigns: 'campaigns',
    daily_campaigns: 'daily_campaigns',
    coupons: 'coupons',
    coupon_uses: 'coupon_uses',
    check_ins: 'check_ins',
    wheel_prizes: 'wheel_prizes',
    wheel_spins: 'wheel_spins',
    daily_claims: 'daily_claims',
    first_order_bonuses: 'first_order_bonuses',
    referrals: 'referrals',
    feedback: 'feedback',
    google_review_requests: 'google_review_requests',
    customer_notes: 'customer_notes',
    in_app_notifications: 'in_app_notifications',
    push_subscriptions: 'push_subscriptions',
    push_send_log: 'push_send_log'
  };

  let failed = false;
  console.log('Tablo           | JSONB | SQL  | Durum');
  console.log('----------------|-------|------|------');

  for (const [jsonKey, table] of Object.entries(mapping)) {
    const expected = source[jsonKey];
    const actual = target[table];
    const ok = expected === actual;
    if (!ok) failed = true;
    console.log(
      `${table.padEnd(15)} | ${String(expected).padStart(5)} | ${String(actual).padStart(4)} | ${ok ? 'OK' : 'FAIL'}`
    );
  }

  const sourceChecksum = checksum(source);
  const targetChecksum = checksum(target);
  console.log('\nJSONB checksum:', sourceChecksum);
  console.log('SQL checksum  :', targetChecksum);

  const migration = await sql`
    SELECT id, checksum, applied_at FROM schema_migrations
    WHERE id = '001_jsonb_to_relational' LIMIT 1
  `;
  if (migration.length) {
    const match = migration[0].checksum === sourceChecksum;
    console.log(`Migration kaydı: ${migration[0].applied_at} checksum ${match ? 'eşleşti' : 'FARKLI'}`);
    if (!match) failed = true;
  } else {
    console.log('Migration kaydı bulunamadı (henüz çalıştırılmamış olabilir).');
  }

  if (failed) {
    console.error('\nDoğrulama BAŞARISIZ.');
    process.exit(1);
  }

  console.log('\nDoğrulama başarılı.');
}

main();
