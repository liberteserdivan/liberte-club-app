import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig, checkOverall, checkLoyalty } from '../api/_lib/guardian/guardianHealth.js';
import { handleGuardian } from '../api/_lib/handlers/guardian.js';
import { STATUS } from '../api/_lib/guardian/guardianConstants.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
    json(obj) { this.body = obj; return this; }
  };
}

test('checkConfig DATABASE_URL yoksa critical döner', async () => {
  const prev = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const report = await checkConfig();
  assert.equal(report.status, STATUS.CRITICAL);
  assert.equal(report.details.databaseConfigured, false);
  if (prev !== undefined) process.env.DATABASE_URL = prev;
});

test('checkOverall standart zarf alanlarını içerir', async () => {
  const overall = await checkOverall();
  assert.ok('status' in overall);
  assert.ok('services' in overall);
  assert.ok('safeMode' in overall);
  assert.ok(typeof overall.requiresHuman === 'boolean');
});

test('checkLoyalty her zaman standart servis raporu döner', () => {
  const report = checkLoyalty();
  assert.equal(report.service, 'loyalty');
  assert.ok('status' in report);
});

test('Public health hassas detay (services/metrics) sızdırmaz', async () => {
  const req = { method: 'GET', url: '/api/guardian/health', query: { resource: 'health' }, headers: {} };
  const res = createMockRes();
  await handleGuardian(req, res);
  assert.ok(res.body, 'gövde olmalı');
  assert.ok('status' in res.body);
  assert.ok('requestId' in res.body);
  // Detay/iç metrikler public yanıtta YOK
  assert.equal(res.body.services, undefined);
  assert.equal(res.body.metrics, undefined);
});

test('Admin oturumu olmadan incidents listesi alınamaz (401)', async () => {
  const req = { method: 'GET', url: '/api/guardian/incidents', query: { resource: 'incidents' }, headers: {} };
  const res = createMockRes();
  await handleGuardian(req, res);
  assert.equal(res.statusCode, 401);
});
