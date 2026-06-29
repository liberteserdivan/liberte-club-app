import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveClientHealth } from '../src/lib/clientHealthSeverity.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// --- Server handler (kaynak-metin: ESM mock yerine yapı doğrulaması) ---

test('adminMembers: veri okumaları runSqlReadFast ile fail-fast', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /import \{ runSqlReadFast \} from '\.\.\/runSql\.js'/);
  assert.match(src, /runSqlReadFast\(\(\) => listAllCustomers\(getSql\(\)\)\)/, 'müşteri listesi fail-fast olmalı');
  assert.match(src, /runSqlReadFast\(\(\) => loadLoyaltyMapFromSql\(getSql\(\)\)\)/, 'loyalty okuma fail-fast olmalı');
});

test('adminMembers: geçici DB hatasında 503 ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /import \{ isTransientDbError \} from '\.\.\/dbTransient\.js'/);
  assert.match(src, /if \(isTransientDbError\(error\)\)/, 'transient kontrolü olmalı');
  assert.match(src, /status\(503\)[\s\S]*ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE/, '503 + özel kod dönmeli');
});

test('adminMembers: auth/PIN kontrolü veri okumasından ÖNCE (hızlı 401/403)', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  const authIdx = src.indexOf('requireAdminSession(req, res');
  const readIdx = src.indexOf('listAllCustomers(getSql())');
  assert.ok(authIdx !== -1 && readIdx !== -1);
  assert.ok(authIdx < readIdx, 'admin/PIN kontrolü DB okumasından önce olmalı');
  // requireAdminSession başarısızsa erken return (401/403 handler içinde yazılır)
  assert.match(src, /if \(!admin\) return;/);
});

test('adminMembers: 500 raw DB error sızdırmaz (publicErrorMessage)', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /status\(500\)[\s\S]*publicErrorMessage\(error, 'Üye listesi alınamadı'\)/);
  // Ham error.message doğrudan JSON'a yazılmamalı
  assert.doesNotMatch(src, /error:\s*error\.message/);
});

// --- Guardian client health (davranışsal) ---

test('Guardian: telemetride /api/admin/members 500 varsa healthy göstermez', () => {
  const samples = [
    { endpoint: '/api/admin/members', status: 500, durationMs: 15656, method: 'GET' },
    { endpoint: '/api/state', status: 200, durationMs: 300, method: 'GET' },
    { endpoint: '/api/state', status: 200, durationMs: 280, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.notEqual(health.severity, 'healthy', 'admin/members 500 ile overall healthy olmamalı');
  const incident = health.incidents.find((i) => i.affectedArea === 'config');
  assert.ok(incident, 'config (admin) alanında client incident üretilmeli');
});

test('Guardian: admin/members yavaş (10sn+) ise de incident üretir', () => {
  const samples = [
    { endpoint: '/api/admin/members', status: 200, durationMs: 12000, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.notEqual(health.severity, 'healthy');
});

test('Guardian: temiz telemetride healthy kalır (regresyon koruması)', () => {
  const samples = [
    { endpoint: '/api/admin/members', status: 200, durationMs: 400, method: 'GET' },
    { endpoint: '/api/state', status: 200, durationMs: 250, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.equal(health.severity, 'healthy');
  assert.equal(health.incidents.length, 0);
});

// --- İstemci gating (kaynak-metin) ---

test('App: admin members yalnızca adminVerified sonrası çağrılır (login ekranında yok)', () => {
  const src = read('src/App.jsx');
  assert.match(src, /useAdminMembers\(\{\s*enabled:\s*Boolean\(isAdmin && adminVerified/);
});
