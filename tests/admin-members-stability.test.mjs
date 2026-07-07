import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveClientHealth } from '../src/lib/clientHealthSeverity.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// --- Merkezi hata katmani ve rota izolasyonu ---

test('sendApiError transient DB hatasinda 503 DATABASE_TRANSIENT doner', async () => {
  const { sendApiError } = await import('../api/_lib/http.js');
  const res = {
    headersSent: false,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  sendApiError(res, {
    status: 500,
    code: 'SESSION_RESTORE_FAILED',
    message: 'Oturum okunamadi',
    error: new Error('connection terminated unexpectedly')
  });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'DATABASE_TRANSIENT');
});

test('auth.js: admin-members withSqlRequestNoGuardian kullanir', () => {
  const src = read('api/auth.js');
  assert.match(src, /adminMembersSqlHandler/);
  assert.match(src, /return adminMembersSqlHandler\(req, res\)/);
});

test('push.js: register-device withSqlRequestNoGuardian kullanir', () => {
  const src = read('api/push.js');
  assert.match(src, /registerSqlHandler/);
  assert.match(src, /withSqlRequestNoGuardian\(handlePushRegisterDevice\)/);
});

test('realtime.js: withSqlRequestNoGuardian kullanir (hydrate gecikmesi yok)', () => {
  const src = read('api/realtime.js');
  assert.match(src, /withSqlRequestNoGuardian/);
  assert.doesNotMatch(src, /withSqlRequest\(/);
});

test('pushRegisterDevice: requireSessionLight kullanir', () => {
  const src = read('api/_lib/handlers/pushRegisterDevice.js');
  assert.match(src, /requireSessionLight/);
  assert.doesNotMatch(src, /requireSession\(/);
});

test('getSessionForBootstrap: musteri yoksa null doner', () => {
  const src = read('api/_lib/auth.js');
  const fn = src.slice(src.indexOf('export async function getSessionForBootstrap'), src.indexOf('export async function invalidateCurrentSession'));
  assert.match(fn, /if \(!customer\) return null/);
});

// --- Server handler (kaynak-metin: ESM mock yerine yapı doğrulaması) ---

test('adminMembers: veri okumaları runSqlAdminMembersRead ile fail-fast', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /import \{ runSqlAdminMembersRead \} from '\.\.\/runSql\.js'/);
  assert.match(src, /runSqlAdminMembersRead\(\(\) => listAllCustomers\(getSql\(\)\)\)/, 'müşteri listesi fail-fast olmalı');
  assert.match(src, /loadLoyaltyMapLightFromSql/, 'loyalty hafif okuma olmalı');
  assert.match(src, /loyaltyDegraded/, 'loyalty hatasında kısmi yanıt olmalı');
});

test('adminMembers: geçici DB hatasında sendApiError ile 503', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /sendApiError/);
  assert.match(src, /ADMIN_MEMBERS_FAILED/);
  assert.match(src, /members:\s*true/);
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

test('adminMembers: merkezi hata modulu kullanir', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /sendApiError/);
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

test('Guardian: admin/members yavaş (15sn+) ise incident üretir', () => {
  const samples = [
    { endpoint: '/api/admin/members', status: 200, durationMs: 16000, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.notEqual(health.severity, 'healthy');
});

test('Guardian: admin/members 503 geçici hata incident üretmez', () => {
  const samples = [
    { endpoint: '/api/admin/members', status: 503, durationMs: 1200, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.equal(health.incidents.length, 0, '503 retry geçici — incident olmamalı');
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

test('Guardian: 5 dakikadan eski client hataları incident üretmez', () => {
  const staleTs = Date.now() - 6 * 60 * 1000;
  const samples = [
    { ts: staleTs, endpoint: '/api/admin/members', status: 500, durationMs: 15000, method: 'GET' },
    { ts: Date.now(), endpoint: '/api/state', status: 200, durationMs: 200, method: 'GET' }
  ];
  const health = deriveClientHealth(samples);
  assert.equal(health.severity, 'healthy', 'eski hata penceresi dışında kalmalı');
  assert.equal(health.incidents.length, 0);
});

// --- İstemci gating (kaynak-metin) ---

test('adminMemberClient: 503 transient icin retry var', () => {
  const src = read('src/lib/adminMemberClient.js');
  assert.match(src, /ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE/);
  assert.match(src, /await sleep\(2000\)/);
});

test('App: admin members yalnızca adminVerified sonrası çağrılır (login ekranında yok)', () => {
  const src = read('src/App.jsx');
  assert.match(src, /useAdminMembers\(\{\s*enabled:\s*Boolean\(isAdmin && adminVerified/);
});
