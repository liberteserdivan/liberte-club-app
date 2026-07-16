#!/usr/bin/env node
/**
 * Push abonelik ve son gönderim özeti — token içeriği yazdırılmaz.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
}

const sql = getSql();
if (!sql) {
  console.error('DATABASE_URL yok');
  process.exit(1);
}

const byPlatform = await sql`
  SELECT
    coalesce(platform, 'unknown') AS platform,
    coalesce(channel, 'unknown') AS channel,
    coalesce(permission_status, 'unknown') AS permission_status,
    count(*)::int AS count
  FROM push_subscriptions
  WHERE active = true AND revoked_at IS NULL
  GROUP BY platform, channel, permission_status
  ORDER BY count DESC
`;

const iosGranted = await sql`
  SELECT
    count(*)::int AS count,
    count(*) FILTER (WHERE length(token) BETWEEN 140 AND 200)::int AS fcm_like_length,
    count(*) FILTER (WHERE length(token) < 80)::int AS apns_like_length
  FROM push_subscriptions
  WHERE active = true
    AND revoked_at IS NULL
    AND lower(coalesce(platform, '')) = 'ios'
    AND lower(coalesce(permission_status, '')) = 'granted'
    AND token IS NOT NULL
`;

const recentLogs = await sql`
  SELECT id, sent_count, audience, created_at
  FROM push_send_log
  ORDER BY id DESC
  LIMIT 8
`;

console.log(JSON.stringify({
  activeByPlatform: byPlatform,
  iosGrantedStats: iosGranted[0] || {},
  recentSendLogs: recentLogs
}, null, 2));
