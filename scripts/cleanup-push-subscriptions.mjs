#!/usr/bin/env node
/**
 * Push cihaz kayıtlarını temizle veya sıfırla.
 * Kullanım:
 *   DATABASE_URL=... node scripts/cleanup-push-subscriptions.mjs
 *   DATABASE_URL=... node scripts/cleanup-push-subscriptions.mjs --reset
 */
import { getSql } from './_lib/getSql.mjs';
import { sanitizePushSubscriptions } from '../src/lib/pushSubscriptionSanitize.js';

const STATE_ID = 'liberte';
const resetMode = process.argv.includes('--reset');

async function main() {
  const sql = getSql();
  if (!sql) {
    console.error('DATABASE_URL eksik.');
    process.exit(1);
  }
  const rows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  const data = rows[0]?.data;
  if (!data) {
    console.error('app_state bulunamadı.');
    process.exit(1);
  }

  const before = Array.isArray(data.pushSubscriptions) ? data.pushSubscriptions.length : 0;
  let subscriptions = [];
  let summary = { before, after: 0, removed: before, reset: true };

  if (resetMode) {
    subscriptions = [];
  } else {
    const cleaned = sanitizePushSubscriptions(data.pushSubscriptions || []);
    subscriptions = cleaned.subscriptions;
    summary = cleaned.summary;
  }

  await sql`
    UPDATE app_state
    SET data = ${JSON.stringify({ ...data, pushSubscriptions: subscriptions })}::jsonb,
        updated_at = now()
    WHERE id = ${STATE_ID}
  `;

  console.log(resetMode ? 'Push kayıtları sıfırlandı.' : 'Push kayıtları temizlendi.');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
