#!/usr/bin/env node
/**
 * Migration sonrası eksik indeks ve geçmiş kayıtlarını tamamlar.
 * Kullanım: node scripts/backfill-post-migration.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getSql } from './_lib/getSql.mjs';
import { parseAppStateData } from '../api/_lib/appState.js';
import { normalizeEmail } from '../api/_lib/customerEmails.js';
import { cleanPhone } from '../api/_lib/phone.js';

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

function safeText(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toLocaleString('tr-TR');
  }
  if (typeof value === 'object') return null;
  return String(value);
}

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
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

// Çakışan history id için deterministik yedek id üret
function fallbackEventId(row, index) {
  const seed = `${row.id}|${row.customerId}|${row.createdAt}|${index}`;
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  return 900000000 + Number.parseInt(hex, 16);
}

async function syncCustomerEmails(sql) {
  const rows = await sql`
    SELECT id, phone, email FROM customers
    WHERE email IS NOT NULL AND trim(email) <> ''
  `;
  let inserted = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    const phone = cleanPhone(row.phone);
    const result = await sql`
      INSERT INTO customer_emails (email, customer_id, phone, updated_at)
      VALUES (${email}, ${Number(row.id)}, ${phone}, now())
      ON CONFLICT (email) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        phone = EXCLUDED.phone,
        updated_at = now()
      RETURNING email
    `;
    if (result.length) inserted += 1;
  }
  return inserted;
}

async function backfillLoyaltyEvents(sql, history) {
  const existing = await sql`SELECT id FROM loyalty_events`;
  const knownIds = new Set(existing.map((row) => Number(row.id)));
  let added = 0;

  for (const [index, raw] of (history || []).entries()) {
    const row = raw;
    let eventId = Number(row.id);
    if (knownIds.has(eventId)) {
      eventId = fallbackEventId(row, index);
      if (knownIds.has(eventId)) continue;
    }

    const createdAt = toTimestampParam(row.createdAt);
    const inserted = await sql`
      INSERT INTO loyalty_events (id, customer_id, event_type, category, delta, note, menu_item_id, menu_item_name, created_at, legacy_json)
      VALUES (
        ${eventId},
        ${Number(row.customerId)},
        ${safeText(row.type || row.eventType || 'unknown') || 'unknown'},
        ${safeText(row.category)},
        ${row.delta != null ? Number(row.delta) : null},
        ${safeText(row.note || row.source)},
        ${row.menuItemId != null ? Number(row.menuItemId) : null},
        ${safeText(row.menuItemName)},
        ${createdAt ?? sql`now()`},
        ${JSON.stringify(row)}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length) {
      knownIds.add(eventId);
      added += 1;
    }
  }

  return added;
}

loadEnv();
const sql = getSql();

const backupRows = await sql`
  SELECT data FROM app_state_backups ORDER BY created_at DESC LIMIT 1
`;
const backup = parseAppStateData(backupRows[0]?.data);

const emailCount = await syncCustomerEmails(sql);
const eventCount = backup?.history?.length
  ? await backfillLoyaltyEvents(sql, backup.history)
  : 0;

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM customer_emails) AS emails,
    (SELECT count(*)::int FROM loyalty_events) AS events
`;

console.log(JSON.stringify({
  ok: true,
  emailSync: emailCount,
  eventsAdded: eventCount,
  tableCounts: counts[0]
}, null, 2));

await sql.end({ timeout: 5 });
